import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";

class SaveParipesaLeaguesWithFixturesService {
  private readonly apiUrl =
    "https://paripesa.top/service-api/LineFeed/GetSportsShortZip?sports=1&lng=en&country=214&partner=188&virtualSports=true&gr=764&groupChamps=true";
  private readonly fixturesApiUrlTemplate =
    "https://paripesa.top/service-api/LineFeed/Get1x2_VZip?sports=1&champs=&{sourceLeagueId}count=40&lng=en&mode=4&country=214&partner=188&getEmpty=true&virtualSports=true";
  private readonly sourceName = "Paripesa";
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
    console.log("🚀 Fetching Paripesa leagues...");
    const response = await fetchFromApi(this.apiUrl);
    if (!response?.Value?.length) {
      console.warn("⚠️ No leagues found in Paripesa API response.");
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
      "paripesa_leagues_fixtures.json",
      JSON.stringify(jsonData, null, 2)
    );
    console.log("✅ JSON file generated: paripesa_leagues_fixtures.json");
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

export default new SaveParipesaLeaguesWithFixturesService();
