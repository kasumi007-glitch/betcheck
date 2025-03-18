// services/22bet/Fetch22betLeaguesService.ts
import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
import { leagueNameMappings } from "../leagueNameMappings";

class Fetch22betLeaguesService {
  // 22BET API endpoint (GET)
  private readonly leaguesApiUrl =
    "https://platform.22bet.com.sn/api/v3/menu/line/en";

  // Some configuration values (adjust as needed)
  private readonly sportId = 1;
  private readonly lang = "en";
  private readonly sourceName = "22BET";
  private sourceId!: number;

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
  }

  async syncLeagues() {
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
      const dbCountry = await db("countries")
        .where("name", category.name)
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
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;

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
}

export default new Fetch22betLeaguesService();
