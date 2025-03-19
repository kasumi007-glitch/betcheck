import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { fetchFromApi } from "../../utils/ApiClient";
import { MarketObj } from "../interfaces/MarketObj";

class AddPremierBetOddService {
  private readonly apiUrlTemplate =
    "https://sports-api.premierbet.com/ci/v1/events/{fixtureId}?country=CI&group=g4&platform=desktop&locale=en";

  private readonly sourceName = "PREMIERBET";
  private sourceId!: number;

  // 1) Market ID → Market Name
  private readonly groupMapping: Record<number, string> = {
    3: "1X2",
    29: "Over / Under",
    7: "Both Teams to Score",
  };

  private dbGroups: Group[] = [];
  private dbMarkets: Market[] = [];

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    this.dbGroups = await this.getGroups();
    this.dbMarkets = await this.getMarkets();
  }

  async syncOdds() {
    await this.init();
    console.log("🚀 Fetching odds data...");

    // Fetch all countries and leagues from the database
    // const countries = await db("countries").select("id", "name");
    // const leagues = await db("source_league_matches").select("source_league_id", "league_id", "source_country_name");

    // Fetch all fixtures with date >= current datetime
    const fixtures = await db("source_matches")
      .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select(
        "source_matches.source_fixture_id",
        "fixtures.id",
        "fixtures.date",
        "source_matches.competition_id"
      )
      .where("fixtures.date", ">=", new Date())
      .andWhere("source_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true)
      .andWhere("source_matches.source_competition_id", "1008226");

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ Odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    const apiUrl = this.apiUrlTemplate.replace("{fixtureId}", sourceFixtureId);

    const response = await fetchFromApi(apiUrl);

    if (!response) {
      console.warn(`⚠️ No data received for fixture ID: ${sourceFixtureId}`);
      return;
    }

    await this.processEvent(fixtureId, sourceFixtureId, response);
  }

  private async processEvent(
    fixtureId: number,
    sourceFixtureId: string,
    event: any
  ) {
    const { marketGroups } = event;

    if (!marketGroups?.length) {
      return;
    }

    let marketGroup = marketGroups.find((group: any) => group.name === "Main");

    if (!marketGroup?.markets?.length) {
      return;
    }

    // Process each "marketObj" in E
    const filteredData = marketGroup.markets.filter((match: MarketObj) =>
      Object.keys(this.groupMapping).includes(String(match.id))
    );

    if (!filteredData?.length) {
      return;
    }

    for (const market of filteredData) {
      await this.processMarket(fixtureId, sourceFixtureId, market);
    }
  }

  private async processMarket(
    fixtureId: number,
    sourceFixtureId: string,
    market: any
  ) {
    // find market
    const dbGroup = this.dbGroups.find(
      (marketData) => marketData.group_name === market.name
    );

    if (!dbGroup) {
      console.warn(`❌ No 'Group Found' : ${market.name}`);
      return;
    }

    for (const outcome of market.outcomes) {
      if (
        (outcome.name === "Over" || outcome.name === "Under") &&
        outcome.handicap !== "2.5"
      ) {
        // Skip if the name is "Over" or "Under" and the handicap is not "2.5"
        continue;
      }

      const dbMarket = this.dbMarkets.find(
        (marketType) =>
          marketType.market_name === outcome.name &&
          marketType.group_id === dbGroup.group_id
      );

      if (!dbMarket) {
        console.warn(`❌ No 'Market Found' : ${outcome.name}`);
        continue;
      }

      await this.saveMarketOutcome(
        dbGroup.group_id,
        outcome.value,
        dbMarket.market_id,
        fixtureId,
        sourceFixtureId
      );
    }
  }

  private async getGroups(): Promise<Group[]> {
    return await db("groups");
  }

  private async getMarkets(): Promise<Market[]> {
    return await db("markets");
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

    console.log("Odds data inserted/updated successfully.");
  }
}

export default new AddPremierBetOddService();
