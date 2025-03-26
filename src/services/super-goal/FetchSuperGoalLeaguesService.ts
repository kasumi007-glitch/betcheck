import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
// import { countryNameMappings } from "../countryNameMappings";
import { leagueNameMappings } from "../leagueNameMappings";
import GetAccessTokenService from "./GetAccessTokenService";

class FetchSuperGoalLeaguesService {
  private readonly apiUrl =
    "https://online.meridianbet.com/betshop/api/v1/standard/outright/58";
  private readonly sourceName = "SUPERGOOAL";
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
    console.log("🚀 Fetching SUPERGOOAL leagues...");

    const token = await GetAccessTokenService.getAccessToken();

    const response = await httpClientFromApi(this.apiUrl, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
        authorization: `Bearer ${token}`, // Replace with your token
      },
    });

    if (!response?.payload?.length) {
      console.warn("⚠️ No league data received from SUPERGOOAL API.");
      return;
    }

    // Loop over each region (country)
    for (const region of response.payload) {
      const countryName = region.name; // e.g., "English"
      // Apply name mapping if needed.
      const mappedCountryName = this.countryNameMappings[countryName.trim()] ?? countryName.trim();

      // Look up country record in your DB (adjust lookup as needed)
      const dbCountry = await db("countries")
        .where("name", mappedCountryName)
        .andWhere("is_active", true)
        .first();
      if (!dbCountry) {
        console.warn(`⚠️ No match found for country: ${mappedCountryName}`);
        continue;
      }

      // Process each league in this region
      for (const league of region.leagues) {
        await this.processLeague(dbCountry, league);
      }
    }

    console.log("✅ SUPERGOOAL leagues synced successfully!");
  }

  private async processLeague(dbCountry: any, league: any) {
    const sourceLeagueId = league.leagueId;
    const sourceLeagueName = league.name;
    // const mappedLeagueName =
    //   leagueNameMappings[sourceLeagueName] || sourceLeagueName;


    // Get all league mappings for this specific country
    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    // Find the mapped league name if available
    const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
    const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

    // Optionally adjust name mapping if needed.
    const dbLeague = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .first();

    if (dbLeague) {
      console.log(
        `✅ Matched league: ${mappedLeagueName} in ${dbCountry.name}`
      );

      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: dbCountry.name,
          league_id: dbLeague.id,
          country_code: dbCountry.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id"])
        .ignore()
        .returning("*");

      if (result.length > 0) {
        console.log(
          `✅ Inserted new league mapping: ${sourceLeagueName} (DB ID: ${dbLeague.id})`
        );
      } else {
        console.log(
          `⚠️ Duplicate league mapping ignored: ${sourceLeagueName} (DB ID: ${dbLeague.id})`
        );
      }
    } else {
      console.warn(
        `⚠️ No matching league found for ${sourceLeagueName} in ${dbCountry.name}`
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

export default new FetchSuperGoalLeaguesService();
