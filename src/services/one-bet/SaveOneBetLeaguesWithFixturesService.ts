import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
import fs from "fs";

class SaveOneBetLeaguesWithFixturesService {
  private readonly countriesApiUrl =
    "https://api.cmonebet.com/sports/get/countries";
  private readonly leaguesApiUrl =
    "https://api.cmonebet.com/sports/get/tournaments";
  private readonly fixturesApiUrl = "https://api.cmonebet.com/sports/get/match";
  private readonly sportId = 1;
  private readonly lang = "en";
  private readonly sourceName = "ONEBET";
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
    console.log("🚀 Fetching ONEBET countries...");
    const countryParams = new URLSearchParams({
      sport_id: String(this.sportId),
      Lang: this.lang,
    }).toString();

    const countryResponse = await httpClientFromApi(this.countriesApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: countryParams,
    });

    if (!countryResponse?.data?.result?.length) {
      console.warn("⚠️ No countries found in ONEBET API response.");
      return;
    }

    let jsonData: any = { countries: {} };

    for (const country of countryResponse.data.result) {
      await this.processCountry(country, jsonData);
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    fs.writeFileSync(
      "onebet_leagues_fixtures.json",
      JSON.stringify(jsonData, null, 2)
    );
    console.log("✅ JSON file generated: onebet_leagues_fixtures.json");
  }

  private async processCountry(country: any, jsonData: any) {
    const countryName = country.country_name;
    console.log(`🌍 Processing country: ${countryName}`);
    jsonData.countries[countryName] = { leagues: {} };

    const leagueParams = new URLSearchParams({
      sport_id: String(this.sportId),
      country_name: countryName,
      Lang: this.lang,
    }).toString();

    const leaguesResponse = await httpClientFromApi(this.leaguesApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: leagueParams,
    });

    if (!leaguesResponse?.data?.result?.length) return;

    for (const league of leaguesResponse.data.result) {
      await this.processLeague(league, jsonData, countryName);
    }
  }

  private async processLeague(league: any, jsonData: any, countryName: string) {
    const leagueId = league.tournament_id;
    const leagueName = league.tournament_name;
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
    const fixtureParams = new URLSearchParams({
      sport_id: String(this.sportId),
      tournament_id: String(leagueId),
      Lang: this.lang,
    }).toString();

    const response = await httpClientFromApi(this.fixturesApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: fixtureParams,
    });
    if (!response?.data?.result?.length) return;

    for (const fixture of response.data.result) {
      this.processMatch(fixture, leagueId, jsonData, countryName);
    }
  }

  private processMatch(
    match: any,
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const homeTeam = match.home_name.trim();
    const awayTeam = match.away_name.trim();

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

export default new SaveOneBetLeaguesWithFixturesService();
