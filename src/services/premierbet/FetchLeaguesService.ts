import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { leagueNameMappings } from '../leagueNameMappings';


class FetchLeaguesService {
  private readonly apiUrl =
    "https://sports-api.premierbet.com/ci/v1/competitions?country=CI&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";

  private readonly sourceName = "PremierBet";
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
    await this.init();
    console.log("🚀 Fetching leagues data...");
    const response = await fetchFromApi(this.apiUrl);

    if (!response?.categories.length) {
      console.warn("⚠️ No data received from API.");
      return;
    }

    for (const category of response.categories) {
      const sourceCountryName = category.name;
      console.log(`🔍 Processing leagues for country: ${sourceCountryName}`);

      for (const competition of category.competitions) {
        await this.processCompetition(category, competition);
      }
    }

    console.log("✅ Leagues data synced successfully!");
  }

  private async processCompetition(category: any, competition: any) {
    const { id: sourceLeagueId, name: sourceLeagueName } = competition;
    const sourceCountryName = category.name;

    // Apply name mappings if available
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;

    const country = await db("countries")
      .where("name", sourceCountryName)
      .first();

    if (!country) {
      console.warn(`⚠️ No match found for country: ${sourceCountryName}`);
      return;
    }

    const league = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", country.code)
      .first();

    if (league) {
      console.log(
        `✅ Matched league: ${mappedLeagueName} in ${sourceCountryName}`
      );

      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: sourceCountryName,
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
          `✅ Inserted new league: ${sourceLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      } else {
        console.warn(
          `⚠️ Ignored duplicate league: ${sourceLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      }
    } else {
      console.warn(
        `⚠️ No match found for league: ${sourceLeagueName} in ${sourceCountryName}`
      );
    }
  }
}

export default new FetchLeaguesService();
