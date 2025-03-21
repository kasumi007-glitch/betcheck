import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";

class SaveBetclicLeaguesWithFixturesService {
  private readonly countryApiUrl = "https://uodyc08.com/api/v3/user/left-menu/supercategories/1";
  private readonly leaguesApiUrlTemplate = "https://uodyc08.com/api/v1/allsports/subcategories/{countryId}";
  private readonly fixturesApiUrlTemplate = "https://uodyc08.com/api/v3/user/line/list?lc[]=1&lsc={countryId}&lsubc={leagueId}&ss=all&l=20&ltr=0";
  private readonly sourceName = "BETCLIC";
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
    console.log("🚀 Fetching Betclic countries...");
    const countryResponse = await fetchFromApi(this.countryApiUrl);
    if (!countryResponse?.supercategory_dto_collection?.length) {
      console.warn("⚠️ No countries received from Betclic API.");
      return;
    }

    let jsonData: any = { countries: {} };

    for (const country of countryResponse.supercategory_dto_collection) {
      await this.processCountry(country, jsonData);
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    fs.writeFileSync("betclic_leagues_fixtures.json", JSON.stringify(jsonData, null, 2));
    console.log("✅ JSON file generated: betclic_leagues_fixtures.json");
  }

  private async processCountry(country: any, jsonData: any) {
    const countryId = country.id;
    const countryName = country.title.trim();
    console.log(`🔍 Processing country: ${countryName}`);

    jsonData.countries[countryName] = { leagues: {} };
    const leaguesUrl = this.leaguesApiUrlTemplate.replace("{countryId}", String(countryId));
    const leaguesResponse = await fetchFromApi(leaguesUrl);
    if (!leaguesResponse?.length) return;

    for (const league of leaguesResponse) {
      await this.processLeague(league, jsonData, countryName, countryId);
    }
  }

  private async processLeague(league: any, jsonData: any, countryName: string, countryId: number) {
    const leagueId = league.id;
    const leagueName = league.title.trim();
    console.log(`⚽ Processing league: ${leagueName}`);

    jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };
    await this.fetchAndProcessFixtures(leagueId, jsonData, countryName, countryId);
  }

  private async fetchAndProcessFixtures(leagueId: number, jsonData: any, countryName: string, countryId: number) {
    const fixturesUrl = this.fixturesApiUrlTemplate
      .replace("{countryId}", String(countryId))
      .replace("{leagueId}", String(leagueId));
    const response = await fetchFromApi(fixturesUrl);
    if (!response?.lines_hierarchy?.length) return;

    const fixtureLines = this.extractFixtureLines(response.lines_hierarchy);
    for (const match of fixtureLines) {
      this.processMatch(match, leagueId, jsonData, countryName);
    }
  }

  private extractFixtureLines(hierarchy: any[]): any[] {
    let fixtureLines: any[] = [];
    for (const lineType of hierarchy) {
      for (const category of lineType.line_category_dto_collection || []) {
        for (const superCategory of category.line_supercategory_dto_collection || []) {
          for (const subCategory of superCategory.line_subcategory_dto_collection || []) {
            fixtureLines = fixtureLines.concat(subCategory.line_dto_collection || []);
          }
        }
      }
    }
    return fixtureLines;
  }

  private processMatch(line: any, leagueId: number, jsonData: any, countryName: string) {
    const match = line.match;
    const homeTeam = match.team1?.title.trim();
    const awayTeam = match.team2?.title.trim();

    if (homeTeam && awayTeam && jsonData.countries[countryName].leagues[leagueId]) {
      const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
      if (!fixtures.includes(homeTeam)) {
        fixtures.push(homeTeam);
      }
      if (!fixtures.includes(awayTeam)) {
        fixtures.push(awayTeam);
      }
    }
  }
}

export default new SaveBetclicLeaguesWithFixturesService();
