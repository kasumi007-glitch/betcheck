import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { httpClientFromApi } from "../../utils/HttpClient";
import { MarketObj } from "../interfaces/MarketObj";

class AddBetclicOddService {
  // The URL template for fetching odds for a single fixture by its line id.
  private readonly apiUrlTemplate =
    "https://uodyc08.com/api/v1/lines/{lineId}.json";
  private readonly sourceName = "BETCLIC";
  private sourceId!: number;

  // Instead of numeric IDs, we use the text key (from outcome_groups title)
  // For example, if the outcome group title is "1x2", we map that to our internal market name "1X2"
  private readonly groupMapping: Record<string, string> = {
    "1x2": "1X2",
    "Both Teams To Score": "Both Teams to Score",
    Total: "Over / Under",
  };

  // 3) Outcome Name Mapping
  private readonly outcomeNameNewMapping: Record<string, string> = {
    "1": "1",
    x: "X",
    "2": "2",
    total_over__2_5: "Over",
    total_under_2_5: "Under",
    yes: "Yes",
    no: "No",
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
    console.log("🚀 Fetching Betclic odds data...");

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
      .where("source_matches.source_id", this.sourceId);

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ Betclic odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    // Here we assume the line id used to fetch odds is the same as the source_fixture_id
    const apiUrl = this.apiUrlTemplate.replace("{lineId}", sourceFixtureId);
    // Add the required headers here
    const response = await httpClientFromApi(apiUrl, {
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "x-client-device-id": "mieiqy0bt1fzsvlablv4",
        "x-client-name": "mostbet-com-spa",
        "x-client-platform": "desktop-web",
        "x-client-session": "9iz9f4dkas16irnmi0ew",
        "x-client-version": "1.4.1766",
        "x-requested-with": "XMLHttpRequest",
        Cookie:
          "PHPSESSID=vk7t3hqjv6djgkurq0225nmeq3; lunetics_locale=en; tz=Africa%2FAddis_Ababa",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...", // mimic a real browser if needed
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
    const outcomeGroups = data.outcome_groups;
    if (!outcomeGroups?.length) return;

    const filteredOutcomeGroups = outcomeGroups.filter((group: any) =>
      Object.keys(this.groupMapping).includes(group.title)
    );

    // Process each outcome group
    for (const group of filteredOutcomeGroups) {
      const groupTitle = group.title; // e.g., "1x2", "Both Teams To Score", "Total"
      if (!this.groupMapping[groupTitle]) continue;

      // Find our internal market based on the mapped name
      const internalGroupName = this.groupMapping[groupTitle];
      const dbGroup = this.dbGroups.find(
        (m) => m.group_name === internalGroupName
      );
      if (!dbGroup) {
        console.warn(`❌ No group found for: ${internalGroupName}`);
        continue;
      }

      // Process each outcome within this group
      for (const outcome of group.outcomes) {
        // In BETCLIC the outcome alias (or type_title) is used (e.g., "1", "x", "2", "yes", "no")
        const outcomeName = this.outcomeNameNewMapping[outcome.alias];
        if (!outcomeName) {
          console.warn(
            `❌ No outcome mapping found for outcome code ${outcome.alias} in fixture ${sourceFixtureId}`
          );
          continue;
        }

        const dbMarket = this.dbMarkets.find(
          (mt) =>
            mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
            mt.group_id === dbGroup.group_id
        );
        if (!dbMarket) {
          console.warn(`❌ No market found for outcome: ${outcome.alias}`);
          continue;
        }

        await this.saveMarketOutcome(
          dbGroup.group_id,
          Number(outcome.odd),
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

export default new AddBetclicOddService();
