import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
// import any league name mappings if needed
import { leagueNameMappings } from "../leagueNameMappings";

class FetchBetclicLeaguesService {
  // API endpoint to get all countries (supercategories)
  private readonly countryApiUrl =
    "https://uodyc08.com/api/v3/user/left-menu/supercategories/1";
  // API endpoint template to get leagues for a single country (supercategory)
  private readonly leaguesApiUrlTemplate =
    "https://uodyc08.com/api/v1/allsports/subcategories/{countryId}";
  private readonly sourceName = "BETCLIC";
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
    console.log("🚀 Fetching Betclic countries...");
    const countryResponse = await httpClientFromApi(this.countryApiUrl);
    if (!countryResponse?.supercategory_dto_collection?.length) {
      console.warn("⚠️ No countries received from Betclic API.");
      return;
    }

    // Loop through each country/supercategory
    for (const country of countryResponse.supercategory_dto_collection) {
      // For example, England has id 84
      const countryId = country.id;
      const countryTitle = country.title;
      console.log(`🔍 Processing leagues for country: ${countryTitle}`);

      const countryName = this.countryNameMappings[countryTitle.trim()] ?? countryTitle.trim();
      // Find the country record in our DB (for example by name)
      const dbCountry = await db("countries")
        .where("name", countryName)
        .andWhere("is_active", true)
        .first();
      if (!dbCountry) {
        console.warn(`⚠️ No match found for country: ${countryTitle}`);
        continue;
      }

      // Build URL to get leagues for this country
      const leaguesUrl = this.leaguesApiUrlTemplate.replace(
        "{countryId}",
        String(countryId)
      );
      const leaguesResponse = await httpClientFromApi(leaguesUrl);
      if (!leaguesResponse?.length) {
        console.warn(`⚠️ No leagues received for country: ${countryTitle}`);
        continue;
      }

      // Process each league
      for (const league of leaguesResponse) {
        await this.processLeague(dbCountry, league, countryId);
      }
    }

    console.log("✅ Betclic leagues synced successfully!");
  }

  private async processLeague(
    dbCountry: any,
    league: any,
    sourceCountryId: string
  ) {
    const sourceLeagueId = league.id;
    const sourceLeagueName = league.title;
    const countryName = dbCountry.name;

    // (Optionally apply name mappings here)
    // const mappedLeagueName =
    //   leagueNameMappings[sourceLeagueName] || sourceLeagueName;
    // const mappedLeagueName = sourceLeagueName;


    // Get all league mappings for this specific country
    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    // Find the mapped league name if available
    const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
    const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

    // Find the league in our DB based on mapped name and country code
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
          // Also store the country id from BETCLIC for later use
          source_country_id: sourceCountryId,
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

export default new FetchBetclicLeaguesService();
