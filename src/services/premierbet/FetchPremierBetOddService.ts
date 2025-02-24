import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";

class FetchPremierBetOddService {
  private readonly apiUrl =
    "https://sports-api.premierbet.com/ci/v1/events/3488163?country=CI&group=g4&platform=desktop&locale=en"; // Replace with actual API

  async syncOdds() {
    console.log("🚀 Fetching odds data...");
    const response = await fetchFromApi(this.apiUrl);

    if (!response) {
      console.warn("⚠️ No data received from API.");
      return;
    }

    await this.processEvent(response);

    console.log("✅ Odds data synced successfully!");
  }

  private async processEvent(event: any) {
    const { fixtureId, marketGroups } = event;

    for (const marketGroup of marketGroups) {
      await this.processMarketGroup(marketGroup, fixtureId);
    }
  }

  private async processMarketGroup(marketGroup: any, fixtureId: number) {
    const marketGroupData = await this.getOrCreateMarketGroup(marketGroup.name);

    for (const market of marketGroup.markets) {
      await this.processMarket(
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

  private async processMarket(market: any, groupName: string, groupId: number) {
    if (groupName === "Goal Scorers") {
      // ✅ Ensure "Goal Scorers" is a market under this group
      const goalScorersMarket = await this.getOrCreateMarket(
        "Goal Scorers",
        groupId
      );

      // ✅ Each "market" in Goal Scorers is actually a PLAYER, so we process players
      await this.processMarketEntry(goalScorersMarket.id, market);
    } else {
      // ✅ Normal market
      const marketData = await this.getOrCreateMarket(market.name, groupId);
      for (const outcome of market.outcomes) {
        await this.saveMarketOutcome(outcome, null, marketData.id);
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

  private async processMarketEntry(goalScorersMarketId: number, player: any) {
    // ✅ Ensure the player is stored as a market entry under "Goal Scorers"
    let marketEntry = await db("market_entries")
      .where({ market_id: goalScorersMarketId, entry_name: player.name }) // Store player's name as entry
      .first();

    if (!marketEntry) {
      const [newEntry] = await db("market_entries")
        .insert({
          market_id: goalScorersMarketId, // ✅ Link to the "Goal Scorers" market
          entry_name: player.name, // ✅ Store player's name
        })
        .returning("*");
      marketEntry = newEntry;
    }

    // ✅ Store market outcomes under this market entry
    for (const outcome of player.outcomes) {
      await this.saveMarketOutcome(
        outcome,
        marketEntry.id,
        goalScorersMarketId
      );
    }
  }

  private async saveMarketOutcome(
    outcome: any,
    entryId: number | null,
    marketId: number | null
  ) {
    const conflictTarget =
      entryId && marketId
        ? ["market_entry_id", "outcome_name"]
        : ["market_id", "market_entry_id", "outcome_name"];

    await db("market_outcomes")
      .insert({
        market_entry_id: entryId,
        market_id: marketId,
        outcome_name: outcome.name,
        coefficient: outcome.value,
      })
      .onConflict(conflictTarget)
      .merge(["coefficient"]);

    console.log(
      `✅ Saved market outcome: ${outcome.name} for ${
        entryId ? "market_entry" : "market"
      } ${entryId ?? marketId}`
    );
  }
}

export default new FetchPremierBetOddService();
