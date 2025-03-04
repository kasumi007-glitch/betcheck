import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";

class AddMegaPariOddService {
  private readonly apiUrlTemplate =
    "https://megapari.com/service-api/LineFeed/GetGameZip?id={fixtureId}&lng=en&isSubGames=true&GroupEvents=true&grMode=4&topGroups=&marketType=1";

  private readonly sourceName = "MegaPari";
  private sourceId!: number;

  // ✅ **Market ID Mapping**
  private readonly marketMapping: Record<number, string> = {
    1: "1X2",
    2: "Handicap",
    17: "Over / Under",
    2854: "Asian Handicap",
    99: "Special Bets",
    19: "Both Teams to Score",
    8: "Double Chance",
    62: "Odd / Even goals",
    15: "Over / Under Home Team Goals",
    16: "Over / Under Away Team Goals",
    20: "Correct Score",
    21: "Halftime / Fulltime",
    25: "First Team To Score",
    26: "Last Team To Score",
    27: "Matchbet + Over/Under",
    28: "Both Teams to Score + Totals",
    29: "Clean Sheet Home Team",
    30: "Clean Sheet Away Team",
  };

  // ✅ **Market Group Mapping**
  private readonly marketGroupMapping: Record<string, string> = {
    "1X2": "Main",
    "Over / Under": "Main",
    "Both Teams to Score": "Main",
    "Double Chance": "Main",
    "Draw No Bet": "Main",
    "Handicap": "Main",
    "Halftime / Fulltime": "Main",
    "Highest Scoring Half": "Main",
    "Correct Score": "Main",
    "First Team To Score": "Main",
    "Last Team To Score": "Main",

    "Odd / Even goals": "Goal",
    "Over / Under Home Team Goals": "Goal",
    "Over / Under Away Team Goals": "Goal",
    "Clean Sheet Home Team": "Goal",
    "Clean Sheet Away Team": "Goal",

    "Matchbet + Over/Under": "Combo",
    "Both Teams to Score + Totals": "Combo",
    "Matchbet + Both Teams to Score": "Combo",

    "Total Corners": "Corners",
    "Corner Matchbet": "Corners",
    "Corner Handicap": "Corners",

    "Total Match Cards": "Bookings",
    "Total Home Cards": "Bookings",
    "Total Away Cards": "Bookings",
    "Cards Matchbet": "Bookings",
    "Exact Match Cards": "Bookings",
    "Player Sent Off": "Bookings",

    "Goal Scorers": "Goal Scorers",
  };

  async initialize() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
  }

  async syncOdds() {
    console.log(`🚀 Fetching MegaPari odds data for source ID: ${this.sourceId}`);

    // ✅ Fetch all active fixtures mapped in `source_matches`
    const fixtures = await db("source_matches")
      .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
      .join(
        "source_league_matches",
        "source_matches.competition_id",
        "=",
        "source_league_matches.league_id"
      )
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_matches.source_fixture_id",
        "fixtures.id",
        "fixtures.date",
        "source_matches.competition_id"
      )
      .where("fixtures.date", ">=", new Date())
      .andWhere("leagues.is_active", true);

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ MegaPari odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    const apiUrl = this.apiUrlTemplate.replace("{fixtureId}", sourceFixtureId);
    const response = await fetchFromApi(apiUrl);

    if (!response?.Value) {
      console.warn(`⚠️ No data received for fixture ID: ${sourceFixtureId}`);
      return;
    }

    await this.processMarketData(fixtureId, sourceFixtureId, response.Value);
  }

  private async processMarketData(
    fixtureId: number,
    sourceFixtureId: string,
    marketData: any
  ) {
    if (!marketData?.E) {
      console.warn(`⚠️ No market data found for fixture ID: ${sourceFixtureId}`);
      return;
    }

    for (const market of marketData.E) {
      const marketName = this.marketMapping[market.G] || `Unknown Market (${market.G})`;
      const groupName = this.marketGroupMapping[marketName] || "Others";

      const marketGroup = await this.getOrCreateMarketGroup(groupName);
      const marketData = await this.getOrCreateMarket(marketName, marketGroup.id);

      for (const outcome of market.ME || []) {
        await this.saveMarketOutcome(
          outcome,
          null,
          marketData.id,
          fixtureId,
          sourceFixtureId
        );
      }

      if (market.PL) {
        for (const player of market.PL) {
          await this.processMarketEntry(
            fixtureId,
            sourceFixtureId,
            marketData.id,
            player
          );
        }
      }
    }
  }

  private async getOrCreateMarketGroup(groupName: string) {
    let marketGroup = await db("market_groups").where({ name: groupName }).first();
    if (!marketGroup) {
      const [newMarketGroup] = await db("market_groups")
        .insert({ name: groupName })
        .returning("*");
      marketGroup = newMarketGroup;
    }
    return marketGroup;
  }

  private async getOrCreateMarket(marketName: string, groupId: number) {
    let market = await db("markets").where({ name: marketName, group_id: groupId }).first();
    if (!market) {
      const [newMarket] = await db("markets")
        .insert({ name: marketName, group_id: groupId })
        .returning("*");
      market = newMarket;
    }
    return market;
  }

  private async processMarketEntry(
    fixtureId: number,
    sourceFixtureId: string,
    marketId: number,
    player: any
  ) {
    let marketEntry = await db("market_entries")
      .where({
        market_id: marketId,
        entry_name: player.N,
        fixture_id: fixtureId,
        external_source_fixture_id: sourceFixtureId,
        source_id: this.sourceId,
      })
      .first();

    if (!marketEntry) {
      const [newEntry] = await db("market_entries")
        .insert({
          market_id: marketId,
          entry_name: player.N,
          fixture_id: fixtureId,
          external_source_fixture_id: sourceFixtureId,
          source_id: this.sourceId,
        })
        .returning("*");
      marketEntry = newEntry;
    }

    for (const outcome of player.O || []) {
      await this.saveMarketOutcome(
        outcome,
        marketEntry.id,
        marketId,
        fixtureId,
        sourceFixtureId
      );
    }
  }

  private async saveMarketOutcome(
    outcome: any,
    entryId: number | null,
    marketId: number | null,
    fixtureId: number | null,
    externalSourceFixtureId: string | null
  ) {
    await db("market_outcomes")
      .insert({
        market_entry_id: entryId,
        market_id: marketId,
        outcome_name: `Outcome ${outcome.T}`,
        coefficient: outcome.C,
        fixture_id: fixtureId,
        external_source_fixture_id: externalSourceFixtureId,
        source_id: this.sourceId,
      })
      .onConflict(["market_id", "market_entry_id", "outcome_name", "fixture_id", "external_source_fixture_id", "source_id"])
      .ignore();
  }
}

export default new AddMegaPariOddService();
