import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { httpClientFromApi } from "../../utils/HttpClientSN";
import fs from "fs";

class SaveSunubetLeaguesWithFixturesService {
  private readonly countriesApiUrl =
    "https://hg-event-api-prod.sporty-tech.net/api/eventcategories/101";
  private readonly fixturesApiUrlTemplate =
    "https://hg-event-api-prod.sporty-tech.net/api/events?eventCategoryIds={leagueId}&offset=0&length=21&fetchEventBetTypesMode=0&betTypeId=10001&timeFilter=All";
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

  async syncLeaguesAndFixtures() {
    console.log("🚀 Fetching Sunubet leagues...");
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

    let jsonData: any = { countries: {} };

    for (const country of countriesResponse) {
      await this.processCountry(country, jsonData);
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    // 🗓️ Add today's date
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

    // 📝 Save into /src/files/ folder
    const filePath = `./files/sunubet_countries_leagues_fixtures_${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ JSON file generated: ${filePath}`);
  }

  private async processCountry(country: any, jsonData: any) {
    const countryName = country.name;
    console.log(`🌍 Processing country: ${countryName}`);
    jsonData.countries[countryName] = { leagues: {} };

    for (const league of country.subCategories) {
      await this.processLeague(league, jsonData, countryName);
    }
  }

  private async processLeague(league: any, jsonData: any, countryName: string) {
    const leagueId = league.id;
    const leagueName = league.name;
    console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

    jsonData.countries[countryName].leagues[leagueId] = {
      name: leagueName,
      fixtures: [],
    };
    await this.fetchAndProcessFixtures(leagueId, jsonData, countryName);
  }

  private async fetchAndProcessFixtures(
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const fixturesUrl = this.fixturesApiUrlTemplate.replace(
      "{leagueId}",
      String(leagueId)
    );
    const response = await httpClientFromApi(fixturesUrl, {
      method: "GET",
      headers: {
        Referer: "https://sunubet.com/",
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
      },
    });
    if (!response?.length) return;

    for (const fixture of response) {
      this.processMatch(fixture, leagueId, jsonData, countryName);
    }
  }

  private processMatch(
    match: any,
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const homeTeam = match.homeTeamName.trim();
    const awayTeam = match.awayTeamName.trim();

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
}

export default new SaveSunubetLeaguesWithFixturesService();
