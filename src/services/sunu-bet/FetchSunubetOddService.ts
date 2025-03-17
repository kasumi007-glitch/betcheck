// src/services/AddSunubetOddService.ts
import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { fetchFromApi } from "../../utils/ApiClient";
import { httpClientFromApi } from "../../utils/HttpClient";
import { MarketObj } from "../interfaces/MarketObj";

class FetchSunubetOddService {
  // URL template for fetching odds for a given fixture (event id)
  private readonly apiUrlTemplate =
    "https://hg-event-api-prod.sporty-tech.net/api/events/{fixtureId}";
  private readonly sourceName = "SUNUBET";
  private sourceId!: number;

  // Mapping from outcome group titles to your internal market names.
  private readonly groupMapping: Record<string, string> = {
    "1X2": "1X2",
    "Both Teams To Score": "Both Teams to Score",
    "Over / Under": "Over / Under",
  };

  // Outcome mapping – adjust keys based on SUNUBET’s outcome aliases.
  private readonly outcomeNameNewMapping: Record<string, string> = {
    "1": "1",
    X: "X",
    "2": "2",
    "> 2.5": "Over",
    "< 2.5": "Under",
    Yes: "Yes",
    No: "No",
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
    console.log("🚀 Fetching Sunubet odds data...");

    // Get all future fixtures for Sunubet from source_matches
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
      .andWhere("source_matches.source_id", this.sourceId);

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ Sunubet odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    const apiUrl = this.apiUrlTemplate.replace("{fixtureId}", sourceFixtureId);
    // If any special headers are needed by SUNUBET, add them here.
    const response = await httpClientFromApi(apiUrl, {
      method: "GET",
      headers: {
        Referer: "https://sunubet.com/",
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
      },
    });
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
    const outcomeGroups = data.eventBetTypes; // SUNUBET returns odds under eventBetTypes
    if (!outcomeGroups?.length) return;

    // Filter groups to those that have mappings
    const filteredOutcomeGroups = outcomeGroups.filter((group: any) =>
      Object.keys(this.groupMapping).includes(group.name)
    );

    for (const group of filteredOutcomeGroups) {
      const internalGroupName = this.groupMapping[group.name];
      const dbGroup = this.dbGroups.find(
        (m) => m.group_name.toLowerCase() === internalGroupName.toLowerCase()
      );
      if (!dbGroup) {
        console.warn(`❌ No Group found for: ${internalGroupName}`);
        continue;
      }

      // Process each outcome in the group.
      for (const outcome of group.eventBetTypeItems) {
        // Use outcome.shortName (trim and lower) to map to our internal outcome name.
        const outcomeAlias = outcome.shortName;
        const outcomeName = this.outcomeNameNewMapping[outcomeAlias];
        if (!outcomeName) {
          console.warn(
            `❌ No outcome mapping found for outcome code ${outcome.shortName} in fixture ${sourceFixtureId}`
          );
          continue;
        }

        const dbMarket = this.dbMarkets.find(
          (mt) =>
            mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
            mt.group_id === dbGroup.group_id
        );
        if (!dbMarket) {
          console.warn(
            `❌ No market found for outcome: ${outcome.shortName}`
          );
          continue;
        }

        //if (internalMarketName.toLowerCase() === "over / under"{}

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

export default new FetchSunubetOddService();
