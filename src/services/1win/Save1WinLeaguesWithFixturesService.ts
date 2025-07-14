import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClientCI";
import fs from "fs";

class Save1WinLeaguesWithFixturesService {
  private readonly categoriesApiUrl =
    "https://match-storage-parsed.top-parser.com/categories/list?data=%7B%22lang%22:%22en%22,%22service%22:%22prematch%22%7D";
  private readonly tournamentsApiUrl =
    "https://match-storage-parsed.top-parser.com/tournaments/list?data=%7B%22localeId%22%3A82%2C%22lang%22%3A%22en%22%2C%22service%22%3A%22prematch%22%7D";
  private readonly matchesApiUrlTemplate =
    "https://match-storage-parsed.top-parser.com/matches/list?data=%7B%22lang%22:%22en%22,%22localeId%22:82,%22service%22:%22prematch%22,%22categoryId%22:{categoryId},%22onlyOutrights%22:false%7D";
  private readonly sourceName = "1WIN";
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
    console.log("🚀 Fetching 1WIN categories (countries)...");
    const categoriesResponse = await httpClientFromApi(this.categoriesApiUrl);
    if (!categoriesResponse?.categories?.length) {
      console.warn("⚠️ No categories received from 1WIN API.");
      return;
    }

    console.log("🚀 Fetching 1WIN categories (countries)...");
    const tournamentsResponse = await httpClientFromApi(this.tournamentsApiUrl);
    if (!tournamentsResponse?.tournaments?.length) {
      console.warn("⚠️ No tournaments received from 1WIN API.");
      return;
    }

    const countries = categoriesResponse.categories.filter(
      (cat: any) => cat.sportId === 18
    );

    let jsonData: any = { countries: {} };

    for (const country of countries) {
      const tournaments = tournamentsResponse.tournaments.filter(
        (tournament: any) => tournament.sportId === 18 && tournament.categoryId === country.id
      );
      await this.processCountry(country, tournaments, jsonData);
    }

    // 🗓️ Add today's date
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

    // 📝 Save into /src/files/ folder
    const filePath = `./files/1win_countries_leagues_fixtures_${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ JSON file generated: ${filePath}`);
  }

  private async processCountry(country: any, leagueMatches: any[], jsonData: any) {
    const categoryId = country.id;
    const countryName = country.name.trim();
    console.log(`🔍 Processing country: ${countryName}`);

    jsonData.countries[countryName] = { leagues: {} };

    const matchesUrl = this.matchesApiUrlTemplate.replace("{categoryId}", String(categoryId));
    const matchesResponse = await httpClientFromApi(matchesUrl);
    if (!matchesResponse?.matches?.length) return;

    if (!leagueMatches?.length) {
      leagueMatches = matchesResponse.matches.filter((match: any) => match.outright === true);
    }
    const fixtureMatches = matchesResponse.matches.filter((match: any) => match.outright === false);

    await this.processLeagues(leagueMatches, jsonData, countryName);
    await this.processFixtures(fixtureMatches, jsonData, countryName);
  }

  private async processLeagues(leagueMatches: any[], jsonData: any, countryName: string) {
    for (const league of leagueMatches) {
      const sourceLeagueId = league.id;
      const leagueName = league.name?.trim();

      if (!jsonData.countries[countryName].leagues[sourceLeagueId]) {
        jsonData.countries[countryName].leagues[sourceLeagueId] = { name: leagueName, fixtures: [] };
      }
    }
  }

  private async processFixtures(fixtureMatches: any[], jsonData: any, countryName: string) {
    for (const match of fixtureMatches) {
      const homeTeam = match.homeTeamName.trim();
      const awayTeam = match.awayTeamName?.trim();
      const leagueId = match.tournamentId;

      if (leagueId && jsonData.countries[countryName].leagues[leagueId]) {
        const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
        if (!fixtures.includes(homeTeam)) {
          fixtures.push(homeTeam);
        }
        if (awayTeam && !fixtures.includes(awayTeam)) {
          fixtures.push(awayTeam);
        }
      }
    }
  }
}

export default new Save1WinLeaguesWithFixturesService();