import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";

class Save1xBetLeaguesWithFixturesService {
  private readonly apiUrl =
    "https://1xbet.com/LineFeed/GetSportsShortZip?sports=1&lng=en&tf=2200000&tz=3&country=213&virtualSports=true&gr=70&groupChamps=true";
  private readonly fixturesApiUrlTemplate =
    "https://1xbet.com/LineFeed/Get1x2_VZip?sports=1&champs={sourceLeagueId}&count=50&lng=en&tf=2200000&tz=3&mode=4&country=213&getEmpty=true&gr=70";
  private readonly sourceName = "1xBet";
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
    await this.init();

    console.log("🚀 Fetching 1xBet leagues...");
    const response = await fetchFromApi(this.apiUrl);
    if (!response?.Value?.length) {
      console.warn("⚠️ No leagues found in 1xBet API response.");
      return;
    }

    let jsonData: any = { countries: {} };

    const sport = response.Value.find((s: any) => s.I === 1 && s.L);
    if (sport) {
      for (const country of sport.L) {
        await this.processCountry(country, jsonData);
      }
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    fs.writeFileSync(
      "1xbet_leagues_fixtures.json",
      JSON.stringify(jsonData, null, 2)
    );
    console.log("✅ JSON file generated: 1xbet_leagues_fixtures.json");
  }

  private async processCountry(country: any, jsonData: any) {
    const countryId = country.CI;
    const countryName = country.L;
    console.log(`🌍 Processing country: ${countryName}`);

    jsonData.countries[countryName] = { leagues: {} };

    if (country.SC) {
      for (const league of country.SC) {
        await this.processLeague(league, jsonData, countryName);
      }
    }
  }

  private async processLeague(league: any, jsonData: any, countryName: string) {
    const leagueId = league.LI;
    const leagueName = league.L;
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
      "{sourceLeagueId}",
      String(leagueId)
    );
    const response = await fetchFromApi(fixturesUrl);
    if (!response?.Value?.length) return;

    for (const fixture of response.Value) {
      this.processMatch(fixture, leagueId, jsonData, countryName);
    }
  }

  private processMatch(
    match: any,
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const homeTeam = match.O1.trim();
    const awayTeam = match.O2.trim();

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

export default new Save1xBetLeaguesWithFixturesService();
