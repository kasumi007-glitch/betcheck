// File: src/services/AddSuperGoalOddService.ts
import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { httpClientFromApi } from "../../utils/HttpClient";
import GetAccessTokenService from "./GetAccessTokenService";

class FetchSuperGoalOddService {
  // URL template for fetching odds for a fixture by its external id.
  private readonly apiUrlTemplate =
    "https://online.meridianbet.com/betshop/api/v2/events/{fixtureId}";
  private readonly sourceName = "SUPERGOOAL";
  private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

  // Example market mapping:
  // Map SuperGoal market names to your internal market names.
  private readonly groupMapping: Record<string, string> = {
    "Final Score": "1X2",
    "Total Goals": "Over / Under",
    "Both teams to score": "Both Teams to Score",
    // Extend mapping as needed.
  };

  // Example outcome mapping: maps the external selection names to your internal outcome names.
  // Adjust these as required.
  private readonly outcomeMapping: Record<string, string> = {
    "1": "1",
    X: "X",
    "2": "2",
    NG: "No",
    GG: "Yes",
    Over: "Over",
    Under: "Under",
    // add other mappings as needed…
  };

  async init() {
    // Get the source id from your database (or insert if missing)
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    // Load markets and market types from your DB
    this.dbGroups = await db("groups");
    this.dbMarkets = await db("markets");
  }

  async syncOdds() {
    await this.init();
    console.log("🚀 Fetching SuperGoal odds data...");
    // Retrieve future fixtures from your source_matches table (adapt query as needed)
    const fixtures = await db("source_matches")
      .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select(
        "source_matches.source_fixture_id",
        "fixtures.id",
        "fixtures.date"
      )
      .where("fixtures.date", ">=", new Date())
      .andWhere("leagues.is_active", true)
      .andWhere("leagues.external_id", 39)
      .andWhere("source_matches.source_id", this.sourceId);

    const token = await GetAccessTokenService.getAccessToken();

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(
        fixture.id,
        fixture.source_fixture_id,
        token
      );
    }

    console.log("✅ SuperGoal odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    externalFixtureId: string,
    token: string
  ) {
    const apiUrl = this.apiUrlTemplate.replace(
      "{fixtureId}",
      externalFixtureId
    );
    // Pass any required headers. For example, include an Authorization header.
    const response = await httpClientFromApi(apiUrl, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
        authorization: `Bearer ${token}`, // Replace with your token
      },
    });
    if (!response) {
      console.warn(`⚠️ No odds data for fixture id: ${externalFixtureId}`);
      return;
    }
    await this.processOddsResponse(fixtureId, externalFixtureId, response);
  }

  private async processOddsResponse(
    fixtureId: number,
    externalFixtureId: string,
    data: any
  ) {
    const games = data.payload?.games;
    if (!Array.isArray(games)) return;

    for (const game of games) {
      const internalGroupName = this.groupMapping[game.marketName];
      if (!internalGroupName) continue;

      const dbGroup = this.findDbGroup(internalGroupName);
      if (!dbGroup) {
        console.warn(`❌ No Group found for: ${internalGroupName}`);
        continue;
      }

      const markets = game.markets;
      if (!Array.isArray(markets)) continue;

      for (const market of markets) {
        if (
          internalGroupName === "Over / Under" &&
          market.overUnder !== Number("2.5")
        ) {
          // Skip if the name is "Over" or "Under" and the handicap is not "2.5"
          continue;
        }
        await this.processMarketSelections(
          market.selections,
          dbGroup,
          fixtureId,
          externalFixtureId,
          internalGroupName
        );
      }
    }
  }

  private findDbGroup(internalGroupName: string) {
    return this.dbGroups.find(
      (m) => m.group_name.toLowerCase() === internalGroupName.toLowerCase()
    );
  }

  private async processMarketSelections(
    selections: any[],
    dbGroup: Group,
    fixtureId: number,
    externalFixtureId: string,
    internalMarketName: string
  ) {
    if (!Array.isArray(selections)) return;

    for (const selection of selections) {
      const externalOutcomeName = selection.name;
      const internalOutcomeName =
        this.outcomeMapping[externalOutcomeName] || externalOutcomeName;
      const dbMarket = this.dbMarkets.find(
        (mt) =>
          mt.group_id === dbGroup.group_id &&
          mt.market_name.toLowerCase() === internalOutcomeName.toLowerCase()
      );
      if (!dbMarket) {
        console.warn(
          `❌ No market found for outcome: ${externalOutcomeName} in market ${internalMarketName}`
        );
        continue;
      }
      await this.saveMarketOutcome(
        dbGroup.group_id,
        Number(selection.price),
        dbMarket.market_id,
        fixtureId,
        externalFixtureId
      );
    }
  }

  private async saveMarketOutcome(
    groupId: number,
    coefficient: number,
    marketId: number,
    fixtureId: number,
    externalSourceFixtureId: string
  ) {
    await db("fixture_odds")
      .insert({
        group_id: groupId,
        market_id: marketId,
        coefficient,
        fixture_id: fixtureId,
        external_source_fixture_id: externalSourceFixtureId,
        source_id: this.sourceId,
      })
      .onConflict([
        "group_id",
        "market_id",
        "fixture_id",
        "external_source_fixture_id",
        "source_id",
      ])
      .merge(["coefficient"]);

    console.log(
      `Odds saved: market ${marketId}, fixture ${externalSourceFixtureId}, coefficient ${coefficient}`
    );
  }
}

export default new FetchSuperGoalOddService();
