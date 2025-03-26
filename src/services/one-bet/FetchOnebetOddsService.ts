// services/onebet/AddOnebetOddsService.ts
import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { fetchFromApi } from "../../utils/ApiClient";
import { httpClientFromApi } from "../../utils/HttpClient";

class FetchOnebetOddsService {
  // ONEBET API endpoint for odds data for a given match.
  private readonly apiUrl = "https://api.cmonebet.com/sports/match/pre/info";
  private readonly sportId = 1;
  private readonly platform = 1;
  private readonly lang = "en";
  private readonly sourceName = "ONEBET";
  private sourceId!: number;

  // You may need to map ONEBET outcome groups to your internal market names.
  private readonly groupMapping: Record<string, string> = {
    "1x2": "1X2",
    "Both teams to score (GG/NG)": "Both Teams to Score",
    Total: "Over / Under",
  };

  // Map ONEBET outcome aliases (or display strings) to your internal outcome names.
  // We only expect "over 2.5" and "under 2.5" for totals.
  private readonly outcomeMapping: Record<string, string> = {
    "1": "1",
    x: "X",
    X: "X",
    "2": "2",
    yes: "Yes",
    no: "No",
    "over 2.5": "Over",
    "under 2.5": "Under",
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
    console.log("🚀 Fetching ONEBET odds data...");

    // Get all future fixtures for ONEBET from the source_matches table.
    const fixtures = await db("source_matches")
      .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select(
        "source_matches.source_fixture_id",
        "fixtures.id",
        "fixtures.date"
      )
      .where("fixtures.date", ">=", new Date())
      .andWhere("source_matches.source_id", this.sourceId);

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ ONEBET odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    // Build POST request parameters for odds endpoint
    const params = new URLSearchParams({
      match_id: sourceFixtureId,
      platform: String(this.platform),
      Lang: this.lang,
    }).toString();

    const response = await httpClientFromApi(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
      },
      data: params,
    });

    if (!response) {
      console.warn(`⚠️ No odds data for fixture id: ${sourceFixtureId}`);
      return;
    }
    await this.processOddsResponse(fixtureId, sourceFixtureId, response.data);
  }

  private async processOddsResponse(
    fixtureId: number,
    sourceFixtureId: string,
    data: any
  ) {
    // The ONEBET API returns nested arrays in data.result.
    // If the first element is an array, flatten the result.
    const outcomeGroups: any[] = Array.isArray(data.result[0])
      ? data.result.flat()
      : data.result;

    if (!outcomeGroups?.length) return;

    // For simplicity, filter outcome groups that we have mappings for.
    const filteredOutcomeGroups = outcomeGroups.filter((group: any) =>
      Object.keys(this.groupMapping).includes(group.market_name)
    );

    for (const group of filteredOutcomeGroups) {
      const groupTitle = group.market_name; // e.g., "1x2"
      const internalGroupName = this.groupMapping[groupTitle];
      const dbGroup = this.dbGroups.find(
        (m) => m.group_name === internalGroupName
      );
      if (!dbGroup) {
        console.warn(`❌ No Group found for: ${internalGroupName}`);
        continue;
      }

      // For ONEBET odds response, outcomes may be directly under group.outcomes
      for (const outcome of group.outcomes) {
        const outcomeName = this.outcomeMapping[outcome.display];
        if (!outcomeName) {
          console.warn(`❌ No outcome mapping found for ${outcome.display}`);
          continue;
        }

        const dbMarket = this.dbMarkets.find(
          (mt) =>
            mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
            mt.group_id === dbGroup.group_id
        );
        if (!dbMarket) {
          console.warn(
            `❌ No market type found for outcome: ${outcome.display}`
          );
          continue;
        }

        await this.saveMarketOutcome(
          dbGroup.group_id,
          Number(outcome.odds),
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

export default new FetchOnebetOddsService();
