import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";

class AddPremierBetOddOldService {
  private readonly apiUrlTemplate =
    "https://sports-api.premierbet.com/ci/v1/events/{fixtureId}?country=CI&group=g4&platform=desktop&locale=en";

  private readonly sourceName = "PREMIERBET";
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

    for (const marketGroup of marketGroups) {
      await this.processMarketGroup(fixtureId, sourceFixtureId, marketGroup);
    }
  }

  private async processMarketGroup(
    fixtureId: number,
    sourceFixtureId: string,
    marketGroup: any
  ) {
    const marketGroupData = await this.getOrCreateMarketGroup(marketGroup.name);

    for (const market of marketGroup.markets) {
      await this.processMarket(
        fixtureId,
        sourceFixtureId,
        market,
        marketGroupData.name,
        marketGroupData.id
      );
    }
  }

  private async getOrCreateMarketGroup(groupName: string) {
    let marketGroup = await db("market_groups")
      .where({ name: groupName })
      .first();
    if (!marketGroup) {
      const [newMarketGroup] = await db("market_groups")
        .insert({ name: groupName })
        .returning("*");
      marketGroup = newMarketGroup;
    }
    return marketGroup;
  }

  private async processMarket(
    fixtureId: number,
    sourceFixtureId: string,
    market: any,
    groupName: string,
    groupId: number
  ) {
    if (groupName === "Goal Scorers") {
      // ✅ Ensure "Goal Scorers" is a market under this group
      const goalScorersMarket = await this.getOrCreateMarket(
        "Goal Scorers",
        groupId
      );

      // ✅ Each "market" in Goal Scorers is actually a PLAYER, so we process players
      await this.processMarketEntry(
        fixtureId,
        sourceFixtureId,
        goalScorersMarket.id,
        market
      );
    } else {
      // ✅ Normal market
      const marketData = await this.getOrCreateMarket(market.name, groupId);
      for (const outcome of market.outcomes) {
        await this.saveMarketOutcome(
          outcome,
          null,
          marketData.id,
          fixtureId,
          sourceFixtureId
        );
      }
    }
  }

  private async getOrCreateMarket(marketName: string, groupId: number) {
    let market = await db("markets")
      .where({ name: marketName, group_id: groupId })
      .first();

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
    goalScorersMarketId: number,
    player: any
  ) {
    // ✅ Ensure the player is stored as a market entry under "Goal Scorers"
    let marketEntry = await db("market_entries")
      .where({
        market_id: goalScorersMarketId,
        entry_name: player.name,
        fixture_id: fixtureId,
        external_source_fixture_id: sourceFixtureId,
        source_id: this.sourceId,
      }) // Store player's name as entry
      .first();

    if (!marketEntry) {
      const [newEntry] = await db("market_entries")
        .insert({
          market_id: goalScorersMarketId, // ✅ Link to the "Goal Scorers" market
          entry_name: player.name, // ✅ Store player's name
          fixture_id: fixtureId,
          external_source_fixture_id: sourceFixtureId,
          source_id: this.sourceId,
        })
        .returning("*");
      marketEntry = newEntry;
    }

    // ✅ Store market outcomes under this market entry
    for (const outcome of player.outcomes) {
      await this.saveMarketOutcome(
        outcome,
        marketEntry.id,
        goalScorersMarketId,
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
    const conflictTarget = [
      "market_id",
      "market_entry_id",
      "outcome_name",
      "fixture_id",
      "external_source_fixture_id",
      "source_id",
    ];

    await db("market_outcomes")
      .insert({
        market_entry_id: entryId,
        market_id: marketId,
        outcome_name: outcome.name,
        coefficient: outcome.value,
        fixture_id: fixtureId,
        external_source_fixture_id: externalSourceFixtureId,
        source_id: this.sourceId,
      })
      .onConflict(conflictTarget)
      .merge(["coefficient"]);

    console.log(
      `✅ Saved market outcome: ${outcome.name} for ${
        entryId ? "market_entry" : "market"
      } ${entryId ?? marketId} for fixture ${
        fixtureId ?? externalSourceFixtureId
      }`
    );
  }
}

export default new AddPremierBetOddOldService();
