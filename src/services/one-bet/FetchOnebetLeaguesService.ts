// services/onebet/FetchOnebetLeaguesService.ts
import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { httpClientFromApi } from "../../utils/HttpClient";
import { leagueNameMappings } from "../leagueNameMappings";

class FetchOnebetLeaguesService {
  // ONEBET API endpoints
  private readonly countriesApiUrl =
    "https://api.cmonebet.com/sports/get/countries";
  private readonly leaguesApiUrl =
    "https://api.cmonebet.com/sports/get/tournaments";

  private readonly sportId = 1;
  private readonly lang = "en";
  private readonly sourceName = "ONEBET";
  private sourceId!: number;

  async init() {
    // Initialize ONEBET source record
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
    console.log("🚀 Fetching ONEBET leagues based on ONEBET countries...");

    // 1. Fetch ONEBET countries from the API
    const countryParams = new URLSearchParams({
      sport_id: String(this.sportId),
      Lang: this.lang,
    }).toString();

    const countryResponse = await httpClientFromApi(this.countriesApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
      },
      data: countryParams,
    });

    if (!countryResponse?.data?.result?.length) {
      console.warn("⚠️ No countries received from ONEBET API.");
      return;
    }

    // 2. Iterate over each ONEBET country and process leagues
    for (const country of countryResponse.data.result) {
      const onebetCountryName = country.country_name;
      // Check if this country exists in our DB and is active
      const dbCountry = await db("countries")
        .where("name", onebetCountryName)
        .andWhere("is_active", true)
        .first();

      if (!dbCountry) {
        console.warn(
          `⚠️ Skipping country '${onebetCountryName}' as it is not active in the DB.`
        );
        continue;
      }

      console.log(`🔍 Processing leagues for country: ${onebetCountryName}`);

      // Build parameters to fetch leagues for this country from ONEBET
      const leagueParams = new URLSearchParams({
        sport_id: String(this.sportId),
        country_name: onebetCountryName,
        Lang: this.lang,
      }).toString();

      const leagueResponse = await httpClientFromApi(this.leaguesApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9",
        },
        data: leagueParams,
      });

      if (!leagueResponse?.data?.result?.length) {
        console.warn(
          `⚠️ No leagues received for country: ${onebetCountryName}`
        );
        continue;
      }

      // Process each league for this active country.
      for (const league of leagueResponse.data.result) {
        await this.processLeague(dbCountry, league);
      }
    }

    console.log("✅ ONEBET leagues synced successfully!");
  }

  private async processLeague(dbCountry: any, league: any) {
    const sourceLeagueId = league.tournament_id;
    const sourceLeagueName = league.tournament_name;
    const countryName = dbCountry.name;

    // Optionally apply name mappings to standardize league names.
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;

    // Look up the league in our internal DB by mapped name and country code (and ensure it is active)
    const dbLeague = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .andWhere("is_active", true)
      .first();

    if (dbLeague) {
      console.log(
        `✅ Matched active league: '${mappedLeagueName}' in '${countryName}'`
      );

      // Insert or update the relationship in our source_league_matches table
      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: countryName,
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
        `⚠️ No active internal league match found for: '${sourceLeagueName}' in '${countryName}'`
      );
    }
  }
}

export default new FetchOnebetLeaguesService();
