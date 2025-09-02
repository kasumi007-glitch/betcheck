import { httpClientFromApi } from "../../../utils/HttpClientAO";
import fs from "fs";

class SaveAllPremierBetLeaguesWithFixturesService {
  private readonly leaguesApiUrl =
    "https://sports-api.premierbet.co.ao/v1/competitions?country=AO&group=g2&platform=desktop&locale=en&timeOffset=-180&sportId=1";
  private readonly fixturesApiUrl =
    "https://sports-api.premierbet.co.ao/v1/events?country=AO&group=g2&platform=desktop&locale=en&sportId=1&competitionId={competitionId}&isGroup=false&limit=10";

  async syncLeaguesAndFixtures() {
    console.log("🚀 Fetching PremierBet leagues...");
    const response = await httpClientFromApi(this.leaguesApiUrl);
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

    // 🗓️ Add today's date
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

    // 📝 Save into /src/files/ folder
    const filePath = `./files/ao/ao_premierbet_countries_leagues_fixtures_${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ JSON file generated: ${filePath}`);
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
    const response = await httpClientFromApi(fixturesUrl);
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

export default new SaveAllPremierBetLeaguesWithFixturesService();
