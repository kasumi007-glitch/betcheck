import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
import fs from "fs";
import GetAccessTokenService from "./GetAccessTokenService";

class SaveSuperGoalLeaguesWithFixturesService {
  private readonly leaguesApiUrl =
    "https://online.meridianbet.com/betshop/api/v1/standard/outright/58";
  private readonly fixturesApiUrlTemplate =
    "https://online.meridianbet.com/betshop/api/v1/standard/sport/58/league?page=0&time=ONE_DAY&leagues={leagueId}";
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

  async syncLeaguesAndFixtures() {
    await this.init();
    console.log("🚀 Fetching SuperGoal leagues...");
    const token = await GetAccessTokenService.getAccessToken();
    const response = await httpClientFromApi(this.leaguesApiUrl, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
        authorization: `Bearer ${token}`, // Replace with your token
      },
    });

    if (!response?.payload?.length) {
      console.warn("⚠️ No leagues found in SuperGoal API response.");
      return;
    }

    let jsonData: any = { countries: {} };
    for (const region of response.payload) {
      await this.processCountry(region, jsonData, token);
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    fs.writeFileSync(
      "supergoal_leagues_fixtures.json",
      JSON.stringify(jsonData, null, 2)
    );
    console.log("✅ JSON file generated: supergoal_leagues_fixtures.json");
  }

  private async processCountry(region: any, jsonData: any, token: string) {
    const countryName =
      this.countryNameMappings[region.name.toLowerCase()] || region.name;
    console.log(`🌍 Processing country: ${countryName}`);
    jsonData.countries[countryName] = { leagues: {} };

    for (const league of region.leagues) {
      await this.processLeague(league, jsonData, countryName, token);
    }
  }

  private async processLeague(league: any, jsonData: any, countryName: string, token: string) {
    const leagueId = league.leagueId;
    const leagueName = league.name;
    console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

    jsonData.countries[countryName].leagues[leagueId] = {
      name: leagueName,
      fixtures: [],
    };
    await this.fetchAndProcessFixtures(leagueId, jsonData, countryName, token);
  }

  private async fetchAndProcessFixtures(
    leagueId: number,
    jsonData: any,
    countryName: string,
    token: string
  ) {
    // const token = await GetAccessTokenService.getAccessToken();
    const fixturesUrl = this.fixturesApiUrlTemplate.replace(
      "{leagueId}",
      String(leagueId)
    );
    const response = await httpClientFromApi(fixturesUrl, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
        authorization: `Bearer ${token}`, // Replace with your token
      },
    });
    if (!response?.payload?.leagues?.length) return;

    for (const event of response.payload.leagues[0].events) {
      this.processMatch(event, leagueId, jsonData, countryName);
    }
  }

  private processMatch(
    event: any,
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const homeTeam = event.header.rivals[0].trim();
    const awayTeam = event.header.rivals[1].trim();

    if (
      homeTeam &&
      awayTeam &&
      jsonData.countries[countryName].leagues[leagueId]
    ) {
      const fixtures =
        jsonData.countries[countryName].leagues[leagueId].fixtures;
      if (!fixtures.includes(homeTeam)) {
        fixtures.push(homeTeam);
      }
      if (!fixtures.includes(awayTeam)) {
        fixtures.push(awayTeam);
      }
    }
  }

  private async loadCountryNameMappings() {
    console.log("🔄 Loading country name mappings...");
    const mappings = await db("country_name_mappings").select(
      "name",
      "mapped_name"
    );
    this.countryNameMappings = mappings.reduce((acc, mapping) => {
      acc[mapping.mapped_name.toLowerCase()] = mapping.name;
      return acc;
    }, {} as Record<string, string>);
    console.log("✅ Country name mappings loaded.");
  }
}

export default new SaveSuperGoalLeaguesWithFixturesService();
