import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
// import any league name mappings if needed
import { leagueNameMappings } from "../leagueNameMappings";

class FetchBetclicLeaguesService {
  // API endpoint to get all countries (supercategories)
  private readonly countryApiUrl =
    "https://uodyc08.com/api/v3/user/left-menu/supercategories/1";
  // API endpoint template to get leagues for a single country (supercategory)
  private readonly leaguesApiUrlTemplate =
    "https://uodyc08.com/api/v1/allsports/subcategories/{countryId}";
  private readonly sourceName = "Betclic";
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
    console.log("🚀 Fetching Betclic countries...");
    const countryResponse = await fetchFromApi(this.countryApiUrl);
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

      // Find the country record in our DB (for example by name)
      const dbCountry = await db("countries")
        .where("name", countryTitle)
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
      const leaguesResponse = await fetchFromApi(leaguesUrl);
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
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;
    // const mappedLeagueName = sourceLeagueName;

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
}

export default new FetchBetclicLeaguesService();
