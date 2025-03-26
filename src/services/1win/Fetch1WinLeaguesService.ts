import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { leagueNameMappings } from "../leagueNameMappings";

class Fetch1WinLeaguesService {
  // Endpoint to fetch all categories (countries)
  private readonly categoriesApiUrl =
    "https://match-storage-parsed.top-parser.com/categories/list?data=%7B%22lang%22:%22en%22,%22service%22:%22prematch%22%7D";
  // Endpoint template to fetch matches (which include league info) for a country
  private readonly matchesApiUrlTemplate =
    "https://match-storage-parsed.top-parser.com/matches/list?data=%7B%22lang%22:%22en%22,%22localeId%22:82,%22service%22:%22prematch%22,%22categoryId%22:{categoryId},%22onlyOutrights%22:false%7D";
  private readonly sourceName = "1WIN";
  private sourceId!: number;
  private countryNameMappings: Record<string, string> = {};

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
    await this.loadCountryNameMappings();
  }

  async syncLeagues() {
    console.log("🚀 Fetching 1WIN countries (categories)...");
    const categoriesResponse = await fetchFromApi(this.categoriesApiUrl);
    if (!categoriesResponse?.categories?.length) {
      console.warn("⚠️ No categories received from 1WIN API.");
      return;
    }

    // Filter to only include categories with sportId 18
    const countries = categoriesResponse.categories.filter(
      (cat: any) => cat.sportId === 18
    );

    for (const country of countries) {
      const countryId = country.id;
      const countryName = country.name.trim(); // e.g., "England"
      console.log(`🔍 Processing leagues for country: ${countryName}`);

      // Find the corresponding country record in our DB (by name)
      const dbCountry = await db("countries")
        .where("name", countryName)
        .first();
      if (!dbCountry) {
        console.warn(`⚠️ No match found for country: ${countryName}`);
        continue;
      }

      // Build the URL to get matches (both leagues and fixtures) for this country
      const matchesUrl = this.matchesApiUrlTemplate.replace(
        "{categoryId}",
        String(countryId)
      );
      const matchesResponse = await fetchFromApi(matchesUrl);
      if (!matchesResponse?.matches?.length) {
        console.warn(`⚠️ No matches received for country: ${countryName}`);
        continue;
      }

      // From the matches, extract those that represent league/tournament info.
      // Here we assume that matches with "outright": true are league-level entries.
      const leagueMatches = matchesResponse.matches.filter(
        (match: any) => match.outright === true
      );

      for (const league of leagueMatches) {
        await this.processLeague(dbCountry, league);
      }
    }

    console.log("✅ 1WIN leagues synced successfully!");
  }

  private async processLeague(dbCountry: any, league: any) {
    // For 1WIN, we use the tournamentId as our source league identifier.
    const sourceLeagueId = league.tournamentId;
    // The league name is taken from homeTeamName (which in outright entries holds the league name)
    const sourceLeagueName = league.homeTeamName.trim();
    const countryName = dbCountry.name;

    // Optionally apply name mappings if needed
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;

    // Find the league in our DB based on the mapped name and country code
    const dbLeague = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .first();

    if (dbLeague) {
      console.log(`✅ Matched league: ${mappedLeagueName} in ${countryName}`);

      // Insert into our source_league_matches table
      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: countryName,
          // Store additional info from 1WIN if needed
          league_id: dbLeague.id,
          country_code: dbCountry.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id"])
        .ignore()
        .returning("*");

      if (result.length > 0) {
        console.log(
          `✅ Inserted new league: ${sourceLeagueName} (League ID: ${dbLeague.id})`
        );
      } else {
        console.warn(
          `⚠️ Ignored duplicate league: ${sourceLeagueName} (League ID: ${dbLeague.id})`
        );
      }
    } else {
      console.warn(
        `⚠️ No match found for league: ${sourceLeagueName} in ${countryName}`
      );
    }
  }

  private async loadCountryNameMappings() {
    console.log("🔄 Loading country name mappings...");
    const mappings = await db("country_name_mappings").select("name", "mapped_name");
    this.countryNameMappings = mappings.reduce((acc, mapping) => {
      acc[mapping.mapped_name.toLowerCase()] = mapping.name;
      return acc;
    }, {} as Record<string, string>);
    console.log("✅ Country name mappings loaded.");
  }
}

export default new Fetch1WinLeaguesService();
