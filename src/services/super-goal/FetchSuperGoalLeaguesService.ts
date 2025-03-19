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
      const mappedCountryName = this.countryNameMappings[countryName.toLowerCase()] || countryName;

      // Look up country record in your DB (adjust lookup as needed)
      const dbCountry = await db("countries")
        .where("name", mappedCountryName)
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
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;

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
    const mappings = await db("country_name_mappings").select(
      "name",
      "mapped_name"
    );

    this.countryNameMappings = mappings.reduce((acc, mapping) => {
      acc[mapping.mapped_name.toLowerCase()] = mapping.name; // Store in lowercase for case-insensitive lookup
      return acc;
    }, {} as Record<string, string>);

    console.log("✅ Country name mappings loaded:", this.countryNameMappings);
  }
}

export default new FetchSuperGoalLeaguesService();
