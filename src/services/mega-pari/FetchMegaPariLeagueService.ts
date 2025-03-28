import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";

class FetchMegaPariLeagueService {
  private readonly apiUrl =
    "https://megapari.com/service-api/LineFeed/GetSportsShortZip?sports=1&lng=en&virtualSports=true&gr=824&groupChamps=true";
  private readonly sourceName = "MEGAPARI";
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
    console.log(`🚀 Fetching leagues data from ${this.sourceName}...`);
    const response = await httpClientFromApi(this.apiUrl);

    if (!response?.Value?.length) {
      console.warn(`⚠️ No data received from ${this.sourceName}.`);
      return;
    }

    for (const sport of response.Value) {
      if (!sport.L) continue; // Skip if no leagues exist

      for (const leagueData of sport.L) {
        if (leagueData.SC) {
          for (const subLeague of leagueData.SC) {
            await this.processLeague(
              subLeague.L,
              subLeague.LI,
              leagueData.L,
              leagueData.CI
            );
          }
        } else {
          await this.processLeague(
            leagueData.L,
            leagueData.LI,
            null,
            leagueData.CI
          );
        }
      }
    }

    console.log(`✅ Successfully synced leagues from ${this.sourceName}!`);
  }

  private async processLeague(
    leagueName: string,
    sourceLeagueId: number,
    parentLeagueName: string | null,
    countryId: number
  ) {
    if (!leagueName.includes(".")) {
      console.warn(
        `⚠️ Skipping league "${leagueName}" - No dot separator found.`
      );
      return;
    }

    // Extract country name & actual league name
    const leagueParts = leagueName.split(".");
    if (leagueParts.length > 2) {
      console.warn(
        `⚠️ Skipping league "${leagueName}" - Too many dot separators.`
      );
      return;
    }
    const extractedLeagueName =
      leagueParts.length > 1 ? leagueParts[1].trim() : leagueName;

    const sourceCountryName =
      leagueParts.length > 1 ? leagueParts[0].trim() : leagueName;

    const countryName = this.countryNameMappings[sourceCountryName.trim()] ?? sourceCountryName.trim();

    // Find country by country code
    const dbCountry = await db("countries")
      .where("name", countryName)
      .andWhere("is_active", true)
      .first();
    if (!dbCountry) {
      console.warn(`⚠️ Country with external_id ${countryId} not found.`);
      return;
    }

    // Get all league mappings for this specific country
    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    // Find the mapped league name if available
    const mapping = countryLeagueMappings.find(m => m.mapped_name === extractedLeagueName);
    const mappedLeagueName = mapping ? mapping.name : extractedLeagueName;

    // Find a matching league in our database
    const league = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .first();

    if (league) {
      console.log(
        `✅ Matched league: ${extractedLeagueName} (Source: ${leagueName}) for ${dbCountry.name}`
      );

      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: extractedLeagueName,
          source_country_name: dbCountry.name,
          league_id: league.id,
          country_code: dbCountry.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id"])
        .ignore() // This prevents duplicate inserts
        .returning("*"); // Returns the inserted row(s) if successful

      // Check if insert was successful or ignored
      if (result.length > 0) {
        console.log(
          `✅ Inserted new league: ${extractedLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      } else {
        console.warn(
          `⚠️ Ignored duplicate league: ${extractedLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      }
    } else {
      console.warn(
        `⚠️ No match found for league: ${extractedLeagueName} (Source: ${leagueName}) in country: ${dbCountry.name}`
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

export default new FetchMegaPariLeagueService();
