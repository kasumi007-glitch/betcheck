import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";

class SavePremierBetLeaguesWithFixturesService {
  private readonly leaguesApiUrl =
    "https://sports-api.premierbet.com/ci/v1/competitions?country=CI&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
  private readonly fixturesApiUrl =
    "https://sports-api.premierbet.com/ci/v1/events?country=CI&group=g4&platform=desktop&locale=en&sportId=1&competitionId={competitionId}&isGroup=false";
  private readonly sourceName = "PremierBet";
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
    console.log("🚀 Fetching PremierBet leagues...");
    const response = await fetchFromApi(this.leaguesApiUrl);
    if (!response?.categories.length) {
      console.warn("⚠️ No leagues found in PremierBet API response.");
      return;
    }

    let jsonData: any = { countries: {} };

    for (const category of response.categories) {
      await this.processCountry(category, jsonData);
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    fs.writeFileSync(
      "premierbet_leagues_fixtures.json",
      JSON.stringify(jsonData, null, 2)
    );
    console.log("✅ JSON file generated: premierbet_leagues_fixtures.json");
  }

  private async processCountry(category: any, jsonData: any) {
    const countryName = category.name;
    console.log(`🌍 Processing country: ${countryName}`);
    jsonData.countries[countryName] = { leagues: {} };

    for (const competition of category.competitions) {
      await this.processLeague(competition, jsonData, countryName);
    }
  }

  private async processLeague(
    competition: any,
    jsonData: any,
    countryName: string
  ) {
    const leagueId = competition.id;
    const leagueName = competition.name;
    console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

    jsonData.countries[countryName].leagues[leagueId] = {
      name: leagueName,
      fixtures: [],
    };
    await this.fetchAndProcessFixtures(leagueId, jsonData, countryName);
  }

  private async fetchAndProcessFixtures(
    competitionId: number,
    jsonData: any,
    countryName: string
  ) {
    const fixturesUrl = this.fixturesApiUrl.replace(
      "{competitionId}",
      String(competitionId)
    );
    const response = await fetchFromApi(fixturesUrl);
    if (!response?.data?.categories.length) return;

    for (const category of response.data.categories) {
      for (const competition of category.competitions) {
        for (const fixture of competition.events) {
          this.processMatch(fixture, competitionId, jsonData, countryName);
        }
      }
    }
  }

  private processMatch(
    match: any,
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const homeTeam = match.eventNames[0].trim();
    const awayTeam = match.eventNames[1].trim();

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

export default new SavePremierBetLeaguesWithFixturesService();
