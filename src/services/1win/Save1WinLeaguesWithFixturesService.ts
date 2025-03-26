import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";

class Save1WinLeaguesWithFixturesService {
  private readonly categoriesApiUrl =
    "https://match-storage-parsed.top-parser.com/categories/list?data=%7B%22lang%22:%22en%22,%22service%22:%22prematch%22%7D";
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
    const categoriesResponse = await fetchFromApi(this.categoriesApiUrl);
    if (!categoriesResponse?.categories?.length) {
      console.warn("⚠️ No categories received from 1WIN API.");
      return;
    }

    const countries = categoriesResponse.categories.filter(
      (cat: any) => cat.sportId === 18
    );

    let jsonData: any = { countries: {} };

    for (const country of countries) {
      await this.processCountry(country, jsonData);
    }

    fs.writeFileSync("1win_leagues_fixtures.json", JSON.stringify(jsonData, null, 2));
    console.log("✅ JSON file generated: 1win_leagues_fixtures.json");
  }

  private async processCountry(country: any, jsonData: any) {
    const categoryId = country.id;
    const countryName = country.name.trim();
    console.log(`🔍 Processing country: ${countryName}`);

    jsonData.countries[countryName] = { leagues: {} };
    
    const matchesUrl = this.matchesApiUrlTemplate.replace("{categoryId}", String(categoryId));
    const matchesResponse = await fetchFromApi(matchesUrl);
    if (!matchesResponse?.matches?.length) return;

    const leagueMatches = matchesResponse.matches.filter((match: any) => match.outright === true);
    const fixtureMatches = matchesResponse.matches.filter((match: any) => match.outright === false);

    await this.processLeagues(leagueMatches, jsonData, countryName);
    await this.processFixtures(fixtureMatches, jsonData, countryName);
  }

  private async processLeagues(leagueMatches: any[], jsonData: any, countryName: string) {
    for (const league of leagueMatches) {
      const sourceLeagueId = league.tournamentId;
      const leagueName = league.homeTeamName ?.trim();
      
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