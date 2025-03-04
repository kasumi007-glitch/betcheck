import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";
import path from "path";

class AddMegaPariOddService {
  private readonly apiUrlTemplate =
    "https://megapari.com/service-api/LineFeed/GetGameZip?id={fixtureId}&lng=en&isSubGames=true&GroupEvents=true&grMode=4&topGroups=&marketType=1";

  private readonly sourceName = "MegaPari";
  private sourceId!: number;

  // 1) Market ID → Market Name
  private readonly marketMapping: Record<number, string> = {
    1: "1X2",
    17: "Over / Under",
    19: "Both Teams to Score",
  };

  // 2) Market Name → Group Name
  private readonly marketGroupMapping: Record<string, string> = {
    "1X2": "Main",
    "Over / Under": "Main",
    "Both Teams to Score": "Main",
  };

  // 3) Outcome Name Mapping
  private readonly outcomeNameMapping: Record<number, string> = {
    1: "1X2",
    17: "Over / Under",
    19: "Both Teams to Score",
  };

  // ❇️ This will be our outcomeMapping, loaded from a JSON
  private outcomeMapping: Record<number, string> = {};

  // Path to the JSON file that has {market_id, market_name}, e.g. T=221 => "Game Score 0:4"
  private readonly mappingJsonFile = "Untitled.json";

  async initialize() {
    // Insert/find source in "sources" table
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
    console.log(`✅ Initialized MegaPari with source_id = ${this.sourceId}`);

    // 2) Load your Untitled.json to fill this.outcomeMapping
    this.loadOutcomeMapping();
  }

  private loadOutcomeMapping() {
    // e.g. file has: [ { market_id: 221, market_name: "Game Score 0:4" }, ...]
    try {
      const filePath = path.join(__dirname, this.mappingJsonFile);
      const raw = fs.readFileSync(filePath, "utf-8");
      const items = JSON.parse(raw);

      for (const item of items) {
        if (item.market_id && item.market_name) {
          this.outcomeMapping[item.market_id] = item.market_name;
        }
      }

      console.log(
        `✅ Loaded ${
          Object.keys(this.outcomeMapping).length
        } outcomes from Untitled.json`
      );
    } catch (error) {
      console.error(`❌ Error loading outcomeMapping: ${error}`);
    }
  }

  async syncOdds() {
    console.log("🚀 Syncing MegaPari odds...");

    // 1) Get fixtures from DB
    const fixtures = await db("source_matches")
      .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select(
        "source_matches.source_fixture_id",
        "fixtures.id",
        "fixtures.date"
      )
      .where("source_matches.source_id", this.sourceId)
      .andWhere("fixtures.date", ">=", new Date())
      .andWhere("leagues.is_active", true)
      .andWhere("leagues.external_id", 39);

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ Done syncing MegaPari odds!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    const url = this.apiUrlTemplate.replace("{fixtureId}", sourceFixtureId);
    const data = await fetchFromApi(url);

    if (!data?.Value) {
      console.warn(`❌ No data for fixture: ${sourceFixtureId}`);
      return;
    }

    // Typically the markets are in data.Value.E
    if (!data.Value.E) {
      console.warn(`❌ No 'E' array for fixture: ${sourceFixtureId}`);
      return;
    }

    // Process each "marketObj" in E
    for (const marketObj of data.Value.E.where()) {
      // G => the market ID
      const marketId = marketObj.G; // e.g. 7 => "Correct Score"

      // 1) Map G => Market Name
      const marketName =
        this.marketMapping[marketId] || `Unknown Market G=${marketId}`;

      // 2) Then map Market Name => Group Name
      const groupName = this.marketGroupMapping[marketName] || "Others";

      // Insert/find group
      const dbGroup = await this.getOrCreateGroup(groupName);
      if (!dbGroup) {
        console.warn(`❌ No 'Group Found' : ${groupName}`);
        continue;
      }

      // Insert/find market
      const dbMarket = await this.getOrCreateMarket(marketName, dbGroup.id);
      if (!dbMarket) {
        console.warn(`❌ No 'Market Found' : ${marketName}`);
        continue;
      }

      // T => the outcome ID we want to map
      const outcomeId = marketObj.T; // e.g. 221
      // outcomeMapping => "Game Score 0:4"
      const outcomeName =
        this.outcomeMapping[outcomeId] || `Outcome T=${outcomeId}`;

      // If "PL" => players array
      if (marketObj.PL) {
        await this.processPlayerEntry(
          fixtureId,
          sourceFixtureId,
          dbMarket.id,
          marketObj,
          outcomeName
        );
      } else if (marketObj.C) {
        // If there's a single coefficient .C, store as an outcome
        await this.saveMarketOutcome(
          // We'll just call it the same as the market
          outcomeName,
          Number(marketObj.C),
          null,
          dbMarket.id,
          fixtureId,
          sourceFixtureId
        );
      }

      // If you also have multiple "outcomes" in marketObj.ME or marketObj.outcomes, you’d loop them similarly
    }
  }

  private async getOrCreateGroup(name: string) {
    let row = await db("market_groups").where({ name }).first();
    // if (!row) {
    //   const [newRow] = await db("market_groups")
    //     .insert({ name })
    //     .returning("*");
    //   row = newRow;
    // }
    return row;
  }

  private async getOrCreateMarket(marketName: string, groupId: number) {
    let row = await db("markets")
      .where({ name: marketName, group_id: groupId })
      .first();
    // if (!row) {
    //   const [newRow] = await db("markets")
    //     .insert({ name: marketName, group_id: groupId })
    //     .returning("*");
    //   row = newRow;
    // }
    return row;
  }

  private async processPlayerEntry(
    fixtureId: number,
    sourceFixtureId: string,
    marketId: number,
    marketObj: any,
    outcomeName: string
  ) {
    const entryName = marketObj.PL.N || "UnknownPlayer";

    let row = await db("market_entries")
      .where({
        market_id: marketId,
        entry_name: entryName,
        fixture_id: fixtureId,
        external_source_fixture_id: sourceFixtureId,
        source_id: this.sourceId,
      })
      .first();
    if (!row) {
      const [newRow] = await db("market_entries")
        .insert({
          market_id: marketId,
          entry_name: entryName,
          fixture_id: fixtureId,
          external_source_fixture_id: sourceFixtureId,
          source_id: this.sourceId,
        })
        .returning("*");
      row = newRow;
    }

    await this.saveMarketOutcome(
      outcomeName,
      Number(marketObj.C || 0),
      row.id, // link to the player's market_entry
      marketId,
      fixtureId,
      sourceFixtureId
    );
  }

  private async saveMarketOutcome(
    outcomeName: string,
    coefficient: number,
    marketEntryId: number | null,
    marketId: number,
    fixtureId: number,
    externalSourceFixtureId: string
  ) {
    await db("market_outcomes")
      .insert({
        market_entry_id: marketEntryId,
        market_id: marketId,
        outcome_name: outcomeName,
        coefficient,
        fixture_id: fixtureId,
        external_source_fixture_id: externalSourceFixtureId,
        source_id: this.sourceId,
      })
      .onConflict([
        "market_id",
        "market_entry_id",
        "outcome_name",
        "fixture_id",
        "external_source_fixture_id",
        "source_id",
      ])
      .ignore();
  }
}

export default new AddMegaPariOddService();
