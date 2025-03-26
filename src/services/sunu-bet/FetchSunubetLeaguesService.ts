// src/services/FetchSunubetLeaguesService.ts
import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { httpClientFromApi } from "../../utils/HttpClient";
// Optionally import a league name mappings file if you need to normalize names
import { leagueNameMappings } from "../leagueNameMappings";

class FetchSunubetLeaguesService {
  // SUNUBET API endpoint to get countries (event categories)
  private readonly countriesApiUrl =
    "https://hg-event-api-prod.sporty-tech.net/api/eventcategories/101";
  private readonly sourceName = "SUNUBET";
  private sourceId!: number;
  private countryNameMappings: Record<string, string> = {};
  private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

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
    await this.loadLeagueNameMappings();
  }

  async syncLeagues() {
    await this.init();
    console.log("🚀 Fetching Sunubet countries and leagues...");
    const countriesResponse = await httpClientFromApi(this.countriesApiUrl, {
      method: "GET",
      headers: {
        Referer: "https://sunubet.com/",
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
      },
    });
    if (!Array.isArray(countriesResponse) || !countriesResponse.length) {
      console.warn("⚠️ No countries received from SUNUBET API.");
      return;
    }

    // Loop through each country category
    for (const country of countriesResponse) {
      const countryName = this.countryNameMappings[country.name.trim()] ?? country.name.trim();
      console.log(`🔍 Processing leagues for country: ${countryName}`);

      // Attempt to match country in our DB (assumed stored in a countries table)
      const dbCountry = await db("countries")
        .where("name", countryName)
        .andWhere("is_active", true)
        .first();
      if (!dbCountry) {
        console.warn(`⚠️ No match found for country: ${countryName}`);
        continue;
      }

      for (const league of country.subCategories) {
        await this.processLeague(dbCountry, league);
      }
    }

    console.log("✅ Sunubet leagues synced successfully!");
  }

  private async processLeague(dbCountry: any, league: any) {
    const sourceLeagueId = league.id;
    const sourceLeagueName = league.name;
    // Apply name mapping if needed.
    // const mappedLeagueName =
    //   leagueNameMappings[sourceLeagueName] || sourceLeagueName;

    
    // Get all league mappings for this specific country
    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    // Find the mapped league name if available
    const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
    const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

    // Find the league in our DB using the mapped name and country code.
    const dbLeague = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .andWhere("is_active", true)
      .first();

    if (dbLeague) {
      console.log(
        `✅ Matched league: ${mappedLeagueName} in ${dbCountry.name}`
      );
      // Insert match record into source_league_matches table
      await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: dbCountry.name,
          league_id: dbLeague.id,
          country_code: dbCountry.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id"])
        .ignore();
    } else {
      console.warn(
        `⚠️ No DB league match found for: ${sourceLeagueName} in ${dbCountry.name}`
      );
    }
  }
  
  private async loadCountryNameMappings() {
    console.log("🔄 Loading country name mappings...");
    const mappings = await db("country_name_mappings").select("name", "mapped_name");
    this.countryNameMappings = mappings.reduce((acc, mapping) => {
      acc[mapping.mapped_name] = mapping.name;
      return acc;
    }, {} as Record<string, string>);
    console.log("✅ Country name mappings loaded.");
  }

  private async loadLeagueNameMappings() {
    console.log("🔄 Loading filtered league name mappings by country...");

    const mappings = await db("league_name_mappings as lm")
      .join("leagues as l", "lm.league_id", "=", "l.external_id")
      .join("countries as c", "l.country_code", "=", "c.code")
      .where("c.is_active", true) // Ensure country is active
      .select("lm.name", "lm.mapped_name", "l.country_code");

    // Group league mappings by country and store as an array
    this.leagueNameMappings = mappings.reduce((acc, mapping) => {
      if (!acc[mapping.country_code]) {
        acc[mapping.country_code] = []; // Initialize an empty array for each country
      }
      acc[mapping.country_code].push({
        name: mapping.name,
        mapped_name: mapping.mapped_name
      });
      return acc;
    }, {} as Record<string, { name: string; mapped_name: string }[]>);

    console.log("✅ Filtered league name mappings categorized by country loaded.");
  }
}

export default new FetchSunubetLeaguesService();
