import axios from "axios";
import { db } from "../infrastructure/database/Database";
import fs from "fs/promises"; // Use promises for async file handling
import path from "path";

class FetchGroupService {
  private readonly BASE_URL =
    "https://v3.traincdn.com/genfiles/cms/betstemplates/bets_model_full_en_";
  private readonly FILE_RANGE = 75; // Fetch from 0 to 75
  private readonly DATA_FILE = path.join(__dirname, "bets_model_full.json"); // Path to store data

  private readonly marketsTable = "markets"; // Table for markets
  private readonly groupsTable = "groups"; // Table for groups
  private readonly marketConflictKey = "market_id"; // Conflict key for markets
  private readonly groupConflictKey = "group_id"; // Conflict key for groups

  // Main function to fetch and store markets data
  async processData() {
    // const rawData = await this.fetchAllOddsData();

    const rawData = await fs.readFile(this.DATA_FILE, "utf-8");
    const jsonData = JSON.parse(rawData);

    const { groups, markets } = this.transformData(jsonData);

    if (groups.length > 0) {
      //await this.saveGroupsToDB(groups);
    }
    if (markets.length > 0) {
      await this.saveMarketsToDBV2(markets);
    } else {
      console.log("No markets found to insert.");
    }
  }

  // Fetch all JSON files dynamically
  private async fetchAllOddsData(): Promise<any> {
    let combinedData: any = {};

    const fetchRequests = Array.from({ length: this.FILE_RANGE + 1 }, (_, i) =>
      this.fetchOddsData(i)
    );

    const results = await Promise.all(fetchRequests);

    results.forEach((data, index) => {
      if (data?.[index]) {
        Object.assign(combinedData, data[index]); // Use the correct key dynamically
      }
    });

    // ✅ Save data to JSON file
    await fs.writeFile(this.DATA_FILE, JSON.stringify(combinedData, null, 2));
    console.log(`Data saved to ${this.DATA_FILE}`);
    return combinedData;
  }

  // Fetch data from a single API file
  private async fetchOddsData(index: number): Promise<any> {
    const url = `${this.BASE_URL}${index}.json`;

    try {
      const response = await axios.get(url);
      if (response?.data) {
        return response.data; // Return full JSON response
      } else {
        console.error(`API response format incorrect for ${url}`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      return null;
    }
  }

  // Transform API response into database-compatible format
  private transformData(rawData: any): { groups: any[]; markets: any[] } {
    const groups: any[] = [];
    const markets: any[] = [];

    Object.keys(rawData).forEach((categoryId) => {
      const category = rawData[categoryId];

      // Extract group details from "GN"
      if (category.GN) {
        Object.entries(category.GN).forEach(([groupId, groupName]) => {
          groups.push({
            group_id: parseInt(groupId),
            group_name: groupName as string,
          });
        });
      }

      // Extract market details from "M"
      if (category.M) {
        Object.keys(category.M).forEach((marketId) => {
          const market = category.M[marketId];

          markets.push({
            market_id: parseInt(marketId),
            market_name: market.N, // Market name
            type: market.T, // Market type
            group_id: market.G, // Group ID
            category: category.C, // Category
          });
        });
      }
    });

    return { groups, markets };
  }

  // Save groups into the database
  private async saveGroupsToDB(groups: any[]) {
    try {
      // Ensure the groups table exists
      const exists = await db.schema.hasTable(this.groupsTable);
      if (!exists) {
        await db.schema.createTable(this.groupsTable, (table) => {
          table.bigInteger("group_id").primary();
          table.string("group_name");
        });
        console.log(`Table '${this.groupsTable}' created.`);
      }

      // Insert group data with upsert (merge on conflict)
      await db(this.groupsTable)
        .insert(groups)
        .onConflict(this.groupConflictKey)
        .merge();

      console.log("Groups data inserted/updated successfully.");
    } catch (error) {
      console.error("Error inserting/updating groups:", error);
    }
  }

  // Save markets into the database
  private async saveMarketsToDB(markets: any[]) {
    try {
      // ✅ Filter out invalid entries
      const validMarkets = markets.filter(
        (m) =>
          typeof m.market_id === "number" &&
          typeof m.market_name === "string" &&
          typeof m.type === "number" &&
          typeof m.group_id === "number" &&
          typeof m.category === "number"
      );

      // ✅ Prevent inserting an empty array
      if (validMarkets.length === 0) {
        console.warn(
          "No valid markets to insert. Skipping database operation."
        );
        return;
      }

      // Ensure the markets table exists
      const exists = await db.schema.hasTable(this.marketsTable);
      if (!exists) {
        await db.schema.createTable(this.marketsTable, (table) => {
          table.bigInteger("market_id").primary();
          table.string("market_name");
          table.integer("type");
          table
            .integer("group_id")
            .references("group_id")
            .inTable(this.groupsTable);
          table.integer("category");
        });
        console.log(`Table '${this.marketsTable}' created.`);
      }

      // Insert batch data with conflict handling
      await db(this.marketsTable)
        .insert(markets)
        .onConflict(this.marketConflictKey)
        .merge();

      console.log("Markets data inserted/updated successfully.");
    } catch (error) {
      console.error("Error inserting/updating markets:", error);
    }
  }

  private async saveMarketsToDBV2(markets: any[]) {
    const logFilePath = path.join(__dirname, "debug_log.txt");
    let logMessages: string[] = [];

    try {
      // Ensure the markets table exists
      const exists = await db.schema.hasTable(this.marketsTable);
      if (!exists) {
        await db.schema.createTable(this.marketsTable, (table) => {
          table.bigInteger("market_id").primary();
          table.string("market_name");
          table.integer("type");
          table
            .integer("group_id")
            .references("group_id")
            .inTable(this.groupsTable);
          table.integer("category");
        });
        console.log(`Table '${this.marketsTable}' created.`);
      }

      console.log(`Total Markets Received: ${markets.length}`);
      logMessages.push(`Total Markets Received: ${markets.length}\n`);

      // ✅ Ensure all data is valid before inserting
      const validMarkets = markets.filter(
        (m) =>
          typeof m.market_id === "number" &&
          typeof m.market_name === "string" &&
          typeof m.type === "number" &&
          typeof m.group_id === "number" &&
          typeof m.category === "number"
      );

      console.log(`Total Valid Markets: ${validMarkets.length}`);
      logMessages.push(`Total Valid Markets: ${validMarkets.length}\n`);

      if (validMarkets.length === 0) {
        console.warn("No valid markets to insert. Skipping.");
        logMessages.push("No valid markets to insert. Skipping.\n");
        await fs.writeFile(logFilePath, logMessages.join(""), { flag: "w" });
        return;
      }

      // ✅ Insert in smaller batches (500 at a time)
      const BATCH_SIZE = 500;
      for (let i = 0; i < validMarkets.length; i += BATCH_SIZE) {
        const batch = validMarkets.slice(i, i + BATCH_SIZE);
        console.log(
          `Inserting batch ${i / BATCH_SIZE + 1}: ${batch.length} records`
        );
        logMessages.push(
          `Inserting batch ${i / BATCH_SIZE + 1}: ${batch.length} records\n`
        );

        try {
          await db(this.marketsTable)
            .insert(batch)
            .onConflict(this.marketConflictKey)
            .merge();
          console.log(`✅ Batch ${i / BATCH_SIZE + 1} inserted successfully.`);
          logMessages.push(
            `✅ Batch ${i / BATCH_SIZE + 1} inserted successfully.\n`
          );
        } catch (error) {
          console.error(
            `❌ Error inserting batch ${i / BATCH_SIZE + 1}:`,
            error
          );
          logMessages.push(
            `❌ Error inserting batch ${i / BATCH_SIZE + 1}: ${error}\n`
          );
        }
      }

      console.log("✅ Finished inserting all market records.");
      logMessages.push("✅ Finished inserting all market records.\n");

      await fs.writeFile(logFilePath, logMessages.join(""), { flag: "w" });
      console.log(`Debug logs saved to ${logFilePath}`);
    } catch (error) {
      console.error("❌ Critical Error in saveMarketsToDB:", error);
      logMessages.push(`❌ Critical Error in saveMarketsToDB: ${error}\n`);
      await fs.writeFile(logFilePath, logMessages.join(""), { flag: "w" });
    }
  }

  private async saveMarketsToDBV3(markets: any[]) {
    const logFilePath = path.join(__dirname, "debug_log.txt"); // Log file path
    let logMessages: string[] = []; // Array to store logs before writing

    try {
      // Ensure the markets table exists
      const exists = await db.schema.hasTable(this.marketsTable);
      if (!exists) {
        await db.schema.createTable(this.marketsTable, (table) => {
          table.bigInteger("market_id").primary();
          table.string("market_name");
          table.integer("type");
          table
            .integer("group_id")
            .references("group_id")
            .inTable(this.groupsTable);
          table.integer("category");
        });
        const tableCreatedMsg = `Table '${this.marketsTable}' created.\n`;
        console.log(tableCreatedMsg);
        logMessages.push(tableCreatedMsg);
      }

      const totalMarkets = markets.length;
      const startMsg = `Total Markets to Insert: ${totalMarkets}\n`;
      console.log(startMsg);
      logMessages.push(startMsg);

      // ✅ Remove duplicates by `market_id`
      const uniqueMarketsMap = new Map();
      const duplicateMarkets: any[] = [];

      for (const market of markets) {
        if (uniqueMarketsMap.has(market.market_id)) {
          duplicateMarkets.push(market); // Save duplicate for debugging
        } else {
          uniqueMarketsMap.set(market.market_id, market);
        }
      }

      // ✅ Log duplicate markets
      if (duplicateMarkets.length > 0) {
        console.warn(
          `Found ${duplicateMarkets.length} duplicate market IDs. They will be skipped.`
        );
        logMessages.push(
          `Found ${duplicateMarkets.length} duplicate market IDs. They will be skipped.\n`
        );
        await fs.writeFile(
          path.join(__dirname, "duplicate_markets.json"),
          JSON.stringify(duplicateMarkets, null, 2)
        );
      }

      // ✅ Loop through each record to check which ones fail
      for (const market of markets) {
        try {
          const marketLog = `Trying to insert market: ${JSON.stringify(
            market,
            null,
            2
          )}\n`;
          console.log(marketLog);
          logMessages.push(marketLog);

          // ✅ Validate record before inserting
          if (
            typeof market.market_id !== "number" ||
            typeof market.market_name !== "string" ||
            typeof market.type !== "number" ||
            typeof market.group_id !== "number" ||
            typeof market.category !== "number"
          ) {
            const invalidRecordMsg = `❌ Skipping invalid market record: ${JSON.stringify(
              market,
              null,
              2
            )}\n`;
            console.warn(invalidRecordMsg);
            logMessages.push(invalidRecordMsg);
            continue;
          }

          // ✅ Insert the individual record
          await db(this.marketsTable)
            .insert(market)
            .onConflict(this.marketConflictKey)
            .merge();

          const successMsg = `✅ Inserted market_id: ${market.market_id} successfully.\n`;
          console.log(successMsg);
          logMessages.push(successMsg);
        } catch (error) {
          const errorMsg = `❌ Failed to insert market_id: ${market.market_id} | Error: ${error}\n`;
          console.error(errorMsg);
          logMessages.push(errorMsg);
        }
      }

      const endMsg = "✅ Finished processing all market records.\n";
      console.log(endMsg);
      logMessages.push(endMsg);

      // ✅ Write all logs to file
      await fs.writeFile(logFilePath, logMessages.join(""), { flag: "w" }); // 'w' overwrites file
      console.log(`Debug logs saved to ${logFilePath}`);
    } catch (error) {
      const criticalErrorMsg = `❌ Critical Error in saveMarketsToDB: ${error}\n`;
      console.error(criticalErrorMsg);
      logMessages.push(criticalErrorMsg);
      await fs.writeFile(logFilePath, logMessages.join(""), { flag: "w" });
    }
  }
}

export default new FetchGroupService();
