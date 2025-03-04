import { db } from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import MarketType from "../../models/MarketType";
import { fetchFromApi } from "../../utils/ApiClient";
import { MarketObj } from "../interfaces/MarketObj";

class AddPremierBetOddService {
  private readonly apiUrlTemplate =
    "https://sports-api.premierbet.com/ci/v1/events/{fixtureId}?country=CI&group=g4&platform=desktop&locale=en";

  private readonly sourceName = "PremierBet";
  private sourceId!: number;

  // 1) Market ID → Market Name
  private readonly marketMapping: Record<number, string> = {
    3: "1X2",
    29: "Over / Under",
    7: "Both Teams to Score",
  };

  private dbMarkets: Market[] = [];
  private dbMarketTypes: MarketType[] = [];

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    this.dbMarkets = await this.getMarkets();
    this.dbMarketTypes = await this.getMarketTypes();
  }

  async syncOdds() {
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
      .where("source_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);

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
      Object.keys(this.marketMapping).includes(String(match.id))
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
    const dbMarket = this.dbMarkets.find(
      (marketData) => marketData.name === market.name
    );

    if (!dbMarket) {
      console.warn(`❌ No 'Market Found' : ${market.name}`);
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

      const dbMarketType = this.dbMarketTypes.find(
        (marketType) =>
          marketType.name === outcome.name &&
          marketType.market_id === dbMarket.id
      );

      if (!dbMarketType) {
        console.warn(`❌ No 'Market Type Found' : ${outcome.name}`);
        continue;
      }

      await this.saveMarketOutcome(
        dbMarketType.id,
        outcome.value,
        dbMarket.id,
        fixtureId,
        sourceFixtureId
      );
    }
  }

  private async getMarkets(): Promise<Market[]> {
    let row: Market[] = await db("markets");
    return row;
  }

  private async getMarketTypes(): Promise<MarketType[]> {
    let row: MarketType[] = await db("market_types");
    return row;
  }

  private async saveMarketOutcome(
    marketTypeId: number,
    coefficient: number,
    marketId: number,
    fixtureId: number,
    externalSourceFixtureId: string
  ) {
    await db("odds")
      .insert({
        market_id: marketId,
        market_type_id: marketTypeId,
        coefficient,
        fixture_id: fixtureId,
        external_source_fixture_id: externalSourceFixtureId,
        source_id: this.sourceId,
      })
      .onConflict([
        "market_id",
        "market_type_id",
        "fixture_id",
        "external_source_fixture_id",
        "source_id",
      ])
      .merge(["coefficient"]);

    console.log("Odds data inserted/updated successfully.");
  }
}

export default new AddPremierBetOddService();
