// services/22bet/Fetch22betLeaguesService.ts
import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
// import { leagueNameMappings } from "../leagueNameMappings";

class Fetch22betLeaguesService {
  // 22BET API endpoint (GET)
  private readonly leaguesApiUrl =
    "https://platform.22bet.com.sn/api/v3/menu/line/en";

  // Some configuration values (adjust as needed)
  private readonly sportId = 1;
  private readonly lang = "en";
  private readonly sourceName = "22BET";
  private sourceId!: number;
  private countryNameMappings: Record<string, string> = {};
  private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};
  async init() {
    // Initialize the source record for 22BET in our database.
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
    console.log("🚀 Fetching 22BET leagues...");

    // 1. Fetch the leagues data from the 22BET endpoint.
    const response = await httpClientFromApi(this.leaguesApiUrl, {
      method: "GET",
    });

    if (!response?.data) {
      console.warn("⚠️ No data received from the 22BET API.");
      return;
    }

    const { leagues, sportCategories } = response.data;
    if (!leagues || leagues.length === 0) {
      console.warn("⚠️ No leagues found in the 22BET API response.");
      return;
    }

    // 2. Filter sportCategories for only those with sportId === this.sportId.
    const filteredCategories = sportCategories.filter(
      (category: any) => category.sportId === this.sportId
    );

    // 3. Loop over each sport category.
    for (const category of filteredCategories) {
      // Look up the corresponding active country in our DB.
      // Here we assume that the sport category's country code matches the DB's "code" field.
      const countryName = this.countryNameMappings[category.name.trim()] ?? category.name.trim();
      const dbCountry = await db("countries")
        .where("name", countryName)
        .andWhere("is_active", true)
        .first();

      if (!dbCountry) {
        console.warn(
          `⚠️ Skipping sport category '${category.name}' because no active country was found for code '${category.countryCode}'.`
        );
        continue;
      }

      console.log(
        `🔍 Processing leagues for sport category '${category.name}' and country '${dbCountry.name}'`
      );

      // 4. For this sport category, filter the leagues by the category id.
      const leaguesForCategory = leagues.filter(
        (league: any) =>
          league.sport_id === this.sportId &&
          league.sportCategoryId === category.id
      );

      if (!leaguesForCategory.length) {
        console.warn(
          `⚠️ No leagues found for sport category '${category.name}'.`
        );
        continue;
      }

      // 5. Loop over each league in the category and process it.
      for (const league of leaguesForCategory) {
        await this.processLeague(dbCountry, league);
      }
    }

    console.log("✅ 22BET leagues synced successfully!");
  }

  private async processLeague(dbCountry: any, league: any) {
    // Use league.id as the sourceLeagueId and league.name as the sourceLeagueName.
    const sourceLeagueId = league.id;
    const sourceLeagueName = league.name;

    // Optionally apply name mappings (if any) to standardize league names.
    // const mappedLeagueName =
    //   this.leagueNameMappings[sourceLeagueName] || sourceLeagueName;

    // Get all league mappings for this specific country
    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    // Find the mapped league name if available
    const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
    const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

    // Look up the internal league (active) by mapped name and country code.
    const dbLeague = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .andWhere("is_active", true)
      .first();

    if (dbLeague) {
      console.log(
        `✅ Matched active league: '${mappedLeagueName}' in '${dbCountry.name}'`
      );

      // Insert (or ignore duplicate) a record into the source_league_matches table.
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
          `✅ Inserted new league: '${sourceLeagueName}' (Internal League ID: ${dbLeague.id})`
        );
      } else {
        console.warn(
          `⚠️ Duplicate league skipped: '${sourceLeagueName}' (Internal League ID: ${dbLeague.id})`
        );
      }
    } else {
      console.warn(
        `⚠️ No active internal league match found for: '${sourceLeagueName}' in '${dbCountry.name}'`
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

export default new Fetch22betLeaguesService();
