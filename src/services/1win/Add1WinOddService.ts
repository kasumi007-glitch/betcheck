import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import Group from "../../models/Group";
import Market from "../../models/Market";

class Add1WinOddService {
  // Endpoint template for fetching odds for a single fixture by match id
  private readonly oddsApiUrlTemplate =
    "https://match-storage-parsed.top-parser.com/odds/list?data=%7B%22lang%22:%22en%22,%22localeId%22:82,%22service%22:%22prematch%22,%22matchId%22:%22{matchId}%22%7D";
  private readonly sourceName = "1WIN";
  private sourceId!: number;

  // Map the returned group id to our internal market names.
  private readonly groupMapping: Record<number, string> = {
    6379: "Over / Under", // odds with over/under outcomes
    6280: "Both Teams to Score", // for yes/no type bets
    6257: "1X2", // for 1X2 betting markets
  };

  // Outcome name mapping uses the outcome name as provided (e.g., "over", "under", "yes", "no", "1", "x", "2")
  private readonly outcomeNameNewMapping: Record<string, string> = {
    over: "Over",
    under: "Under",
    yes: "Yes",
    no: "No",
    "1": "1",
    x: "X",
    "2": "2",
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
    console.log("🚀 Fetching 1WIN odds data...");

    // Get all fixtures for this source (future fixtures)
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

    if (!fixtures.length) {
      console.warn("⚠️ No fixtures found for 1WIN in our database.");
      return;
    }

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ 1WIN odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    const apiUrl = this.oddsApiUrlTemplate.replace(
      "{matchId}",
      sourceFixtureId
    );
    const response = await fetchFromApi(apiUrl);
    if (!response) {
      console.warn(`⚠️ No odds data for fixture id: ${sourceFixtureId}`);
      return;
    }
    await this.processOddsResponse(fixtureId, sourceFixtureId, response);
  }

  private async processOddsResponse(
    fixtureId: number,
    sourceFixtureId: string,
    data: any
  ) {
    const oddsArray = data.odds;
    if (!oddsArray?.length) return;

    // Group odds by their group id (market)
    const groupedOdds = oddsArray.reduce((acc: any, odd: any) => {
      const groupId = odd.group;
      if (!acc[groupId]) acc[groupId] = [];
      acc[groupId].push(odd);
      return acc;
    }, {});

    // Filter out groups that don't have a corresponding market mapping
    const validGroups = Object.entries(groupedOdds).filter(
      ([groupKey]) => this.groupMapping[Number(groupKey)]
    ) as [string, any[]][]; // Now TypeScript knows oddsForGroup is an array

    // Process only valid groups using for…of loops
    for (const [groupKey, oddsForGroup] of validGroups) {
      const groupId = Number(groupKey);
      const internalGroupName = this.groupMapping[groupId];
      const dbGroup = this.dbGroups.find(
        (m) => m.group_name === internalGroupName
      );

      if (!dbGroup) {
        console.warn(`❌ No Group found for: ${internalGroupName}`);
        continue; // Skip to the next group
      }

      for (const odd of oddsForGroup) {
        const outcomeKey = odd.outCome.toLowerCase();
        const outcomeName = this.outcomeNameNewMapping[outcomeKey];

        if (!outcomeName) {
          console.warn(
            `❌ No outcome mapping found for outcome ${odd.outCome} in fixture ${sourceFixtureId}`
          );
          continue; // Skip to the next odd
        }

        if (
          (outcomeKey === "over" || outcomeKey === "under") &&
          odd.specialValue !== "2.5"
        ) {
          // Skip if the name is "Over" or "Under" and the handicap is not "2.5"
          continue;
        }

        const dbMarket = this.dbMarkets.find(
          (mt) =>
            mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
            mt.group_id === dbGroup.group_id
        );

        if (!dbMarket) {
          console.warn(`❌ No market type found for outcome: ${odd.outCome}`);
          continue;
        }

        // Await the asynchronous operation in a sequential manner
        await this.saveMarketOutcome(
          dbGroup.group_id,
          Number(odd.coefficient),
          dbMarket.market_id,
          fixtureId,
          sourceFixtureId
        );
      }
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

    console.log("Odds inserted/updated successfully.");
  }
}

export default new Add1WinOddService();
