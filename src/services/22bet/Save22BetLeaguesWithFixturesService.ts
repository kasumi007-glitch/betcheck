import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";

class Save22BetLeaguesWithFixturesService {
  private readonly leaguesApiUrl =
    "https://platform.22bet.com.sn/api/v3/menu/line/en";
  private readonly fixturesApiUrlTemplate =
    "https://platform.22bet.com.sn/api/event/list?status_in[]=0&limit=150&relations[]=competitors&leagueId_in[]={leagueId}&lang=en";
  private readonly sourceName = "22BET";
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
    console.log("🚀 Fetching 22BET leagues...");
    const response = await fetchFromApi(this.leaguesApiUrl);
    if (!response?.data?.leagues || !response.data.sportCategories) {
      console.warn(
        "⚠️ No leagues or sport categories found in the 22BET API response."
      );
      return;
    }

    const leagues = response.data.leagues;
    const sportCategories = response.data.sportCategories.filter(
      (category: any) => category.sportId === 1
    );

    let jsonData: any = { countries: {} };

    for (const category of sportCategories) {
      await this.processCategory(category, leagues, jsonData);
    }

    fs.writeFileSync(
      "22bet_leagues_fixtures.json",
      JSON.stringify(jsonData, null, 2)
    );
    console.log("✅ JSON file generated: 22bet_leagues_fixtures.json");
  }

  private async processCategory(category: any, leagues: any[], jsonData: any) {
    const countryName = category.name.trim();
    console.log(`🔍 Processing country: ${countryName}`);

    jsonData.countries[countryName] = { leagues: {} };

    const categoryLeagues = leagues.filter(
      (league: any) => league.sportCategoryId === category.id
    );

    for (const league of categoryLeagues) {
      await this.processLeague(league, jsonData, countryName);
    }
  }

  private async processLeague(league: any, jsonData: any, countryName: string) {
    const leagueId = league.id;
    const leagueName = league.name.trim();
    console.log(`⚽ Processing league: ${leagueName}`);

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
    const response = await fetchFromApi(fixturesUrl);
    if (!response?.data?.items) return;

    const { items, relations } = response.data;

    const competitors = relations?.competitors || [];

    for (const match of items) {
      // Find the competitor objects based on the IDs.
      const homeCompetitor = competitors.find(
        (comp: any) => comp.id === match.competitor1Id
      );
      const awayCompetitor = competitors.find(
        (comp: any) => comp.id === match.competitor2Id
      );

      const homeTeam = homeCompetitor?.name || "";
      const awayTeam = awayCompetitor?.name || "";

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
}

export default new Save22BetLeaguesWithFixturesService();
