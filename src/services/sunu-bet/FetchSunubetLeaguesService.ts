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
      const countryName = country.name; // e.g., "Angleterre", "Espagne", etc.
      console.log(`🔍 Processing leagues for country: ${countryName}`);

      // Attempt to match country in our DB (assumed stored in a countries table)
      const dbCountry = await db("countries")
        .where("name", countryName)
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
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;

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
}

export default new FetchSunubetLeaguesService();
