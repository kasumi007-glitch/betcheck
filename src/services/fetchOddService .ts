import fs from "fs";
import path from "path";
import { db } from "../infrastructure/database/Database";

class FetchOddService {
  private readonly ODDS_FILE_PATH = path.join(
    __dirname,
    "../data/odds-new.json"
  ); // Adjust path as needed

  private readonly groupsTable = "groups";
  private readonly marketsTable = "markets";
  private readonly oddsTable = "odds";

  private readonly oddsConflictKeys = [
    "group_id",
    "market_id",
    "parameter",
    "player_id",
  ];

  // Main function to fetch and store odds from the local JSON file
  async processOddsData() {
    const rawData = this.readOddsData();
    const odds = this.transformOddsData(rawData);

    if (odds.length > 0) {
      const filteredOdds = this.filterConflictingOdds(odds); // Check for conflicts within the array itself

      await this.saveOddsToDB(odds);
    } else {
      console.log("No odds found to insert.");
    }
  }

  // Read odds data from JSON file
  private readOddsData(): any {
    try {
      const fileContent = fs.readFileSync(this.ODDS_FILE_PATH, "utf-8");
      const jsonData = JSON.parse(fileContent);
      return jsonData?.Value || {}; // Extract main odds data
    } catch (error) {
      console.error("Error reading odds file:", error);
      return {};
    }
  }

  // Transform odds data from JSON structure
  private transformOddsData(rawData: any): any[] {
    const odds: any[] = [];

    if (rawData?.E) {
      rawData.E.forEach((odd: any) => {
        odds.push({
          coefficient: odd.C,
          group_id: odd.G,
          market_id: odd.T,
          group_sub_id: odd.GS || null,
          parameter: odd.P || null,
          condition: odd.CE || null,
          player_id: odd.PL?.I || null, // Extract Player ID from PL.I
          player_name: odd.PL?.N || null, // Player Name (optional)
          player_type: odd.PL?.T || null, // Player Type (optional)
        });
      });
    }

    return odds;
  }

  // Check for conflicts within the array before inserting
  private filterConflictingOdds(odds: any[]): any[] {
    const uniqueOddsMap = new Map();
    const allOddsMap: any[] = [];

    odds.forEach((odd) => {
      const key = `${odd.group_id}-${odd.market_id}-${odd.parameter}-${odd.player_id}`;
      if (!uniqueOddsMap.has(key)) {
        uniqueOddsMap.set(key, odd);
      } else {
        allOddsMap.push(odd);
      }
    });

    const filteredOdds = Array.from(uniqueOddsMap.values());
    console.log(
      `Filtered odds count: ${filteredOdds.length} (removed duplicates)`
    );

    return filteredOdds;
  }

  // Ensure the odds table exists
  private async createOddsTable() {
    const exists = await db.schema.hasTable(this.oddsTable);
    if (!exists) {
      await db.schema.createTable(this.oddsTable, (table) => {
        table.bigIncrements("id").primary();
        table.float("coefficient");
        table
          .bigInteger("group_id")
          .references("group_id")
          .inTable(this.groupsTable);
        table
          .bigInteger("market_id")
          .references("market_id")
          .inTable(this.marketsTable);
        table.integer("group_sub_id").nullable();
        table.float("parameter").nullable();
        table.integer("condition").nullable();
        table.bigInteger("player_id").nullable(); // Store Player ID (PL.I)
        table.string("player_name").nullable(); // Store Player Name (PL.N)
        table.integer("player_type").nullable(); // Store Player Type (PL.T)

        // Add a composite unique constraint to support ON CONFLICT
        table.unique(this.oddsConflictKeys);
      });
      console.log(`Table '${this.oddsTable}' created.`);
    }
  }

  // Save odds data to database
  private async saveOddsToDB(odds: any[]) {
    try {
      await this.createOddsTable();
      await db(this.oddsTable)
        .insert(odds)
        .onConflict(this.oddsConflictKeys)
        .merge({
          coefficient: db.raw("excluded.coefficient"), // Update coefficient if conflict
          condition: db.raw("excluded.condition"), // Update condition if conflict
          group_id: db.raw("excluded.group_id"), // Keep existing group_id
          group_sub_id: db.raw("excluded.group_sub_id"), // Update group_sub_id
          market_id: db.raw("excluded.market_id"), // Keep existing market_id
          parameter: db.raw("excluded.parameter"), // Update parameter
          player_id: db.raw("excluded.player_id"), // Keep existing player_id
          player_name: db.raw("excluded.player_name"), // Update player name
          player_type: db.raw("excluded.player_type"), // Update player type
        });
      console.log("Odds data inserted/updated successfully.");
    } catch (error) {
      console.error("Error inserting/updating odds:", error);
    }
  }
}

export default new FetchOddService();
