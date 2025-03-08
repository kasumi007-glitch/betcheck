import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { leagueNameMappings } from "../leagueNameMappings";

class FetchGeniusBetLeagueService {
  private readonly apiUrl =
    "https://api.geniusbet.com.gn/api/v2/side-bar";
  private readonly sourceName = "GeniusBet";
  private sourceId!: number;

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
  }

  async syncLeagues() {
    console.log(`🚀 Fetching leagues data from ${this.sourceName}...`);
    const response = await fetchFromApi(this.apiUrl);

    if (!response?.data?.sidebar?.matches?.length) {
      console.warn(`⚠️ No data received from ${this.sourceName}.`);
      return;
    }

    const matches = response.data.sidebar.matches;

    for (const match of matches) {
      if (match.name === "Soccer") {
        if (!match.categories) continue; // Skip if no leagues exist
        const categories = match.categories;

        const countryData = await this.transformData(categories);

        for (const country of countryData) {
          const leagueData = await this.isolateLeagueData(country);

          for (const leagueDatum of leagueData) {
            await this.processLeague(
                leagueDatum.league_name,
                leagueDatum.external_league_id,
                leagueDatum.country_name,
                leagueDatum.external_country_id
            );
          }
        }
      }
    }

    console.log(`✅ Successfully synced leagues from ${this.sourceName}!`);
  }

  private async transformData(data: Array<any>) {
    return data.map(country => ({
      name: country.name,
      id: country.id,
      tournaments: country.tournaments.map((tournament: { id: any; name: any; }) => ({
        id: tournament.id,
        name: tournament.name
      }))
    }));
  }

  private async isolateLeagueData(country: { name: any; id: any; tournaments: any }): Promise<any> {
      return country.tournaments.map((tournament: { id: any; name: any; }) => ({
        external_league_id: tournament.id,
        league_name: tournament.name,
        country_name: country.name,
        external_country_id: country.id,
      }))
    };

  private async processLeague(
    leagueName: string,
    sourceLeagueId: number,
    countryName: string,
    countryId: number
  ) {
    // Find country by country code
    const country = await db("countries")
      .where("name", countryName)
      .first();
    if (!country) {
      console.warn(`⚠️ Country with external_id ${countryId} not found.`);
      return;
    }

    // Find a matching league in our database
    const league = await db("leagues")
      .where("name", leagueName)
      .andWhere("country_code", country.code)
      .first();

    if (league) {
      console.log(
        `✅ Matched league: ${leagueName} (Source: ${leagueName}) for ${country.name}`
      );

      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: leagueName,
          source_country_name: country.name,
          league_id: league.id,
          country_code: country.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id"])
        .ignore() // This prevents duplicate inserts
        .returning("*"); // Returns the inserted row(s) if successful

      // Check if insert was successful or ignored
      if (result.length > 0) {
        console.log(
          `✅ Inserted new league: ${leagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      } else {
        console.warn(
          `⚠️ Ignored duplicate league: ${leagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      }
    } else {
      console.warn(
        `⚠️ No match found for league: ${leagueName} (Source: ${leagueName}) in country: ${country.name}`
      );
    }
  }
}

interface Tournament {
  id: number;
  name: string;
}

interface Country {
  name: string;
  id: number;
  tournaments: Tournament[];
}

interface TransformedTournament {
  external_league_id: number;
  league_name: string;
  country_name: string;
  external_country_id: number;
}

export default new FetchGeniusBetLeagueService();
