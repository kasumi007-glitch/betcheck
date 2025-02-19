import axios from "axios";
import { db } from "../infrastructure/database/Database";

class OddsServiceV2 {
  API_URL =
    "https://v3.traincdn.com/genfiles/cms/betstemplates/bets_model_full_en_0.json"; // Replace with actual API

  tableName = "markets"; // Define the target table
  conflictKey = "market_id"; // Define conflict key for merging

  async processData() {
    const markets = await this.fetchOddsData();
    if (markets.length > 0) {
      await this.saveMarketsToDB(markets);
    } else {
      console.log("No markets found to insert.");
    }
  }

  // Function to fetch data from API
  async fetchOddsData() {
    try {
      const response = await axios.get(this.API_URL);
      if (response?.data?.Success && response?.data?.Value) {
        return response.data.Value.E; // Extracting the array from Value.E
      } else {
        console.error("API response format incorrect:", response.data);
        return [];
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      return [];
    }
  }

  // Function to save data to PostgreSQL using Knex
  async saveMarketsToDB(markets: any[]) {
    try {
      // Ensure table exists
      await db.schema.hasTable(this.tableName).then(async (exists) => {
        if (!exists) {
          await db.schema.createTable(this.tableName, (table) => {
            table.integer("market_id").primary();
            table.string("market_name");
            table.integer("type");
            table.integer("group_id");
            table.float("odds"); // Store odds value
          });
          console.log(`Table '${this.tableName}' created.`);
        }
      });

      // Prepare batch data
      const batch = markets.map((market) => ({
        market_id: market.G,
        market_name: `Market ${market.G}`,
        type: market.T,
        group_id: market.GS,
        odds: market.C, // Assuming `C` holds the odds value
      }));

      // Insert batch data with merge (upsert)
      await db(this.tableName)
        .insert(batch)
        .onConflict(this.conflictKey)
        .merge();

      console.log("Markets data inserted/updated successfully.");
    } catch (error) {
      console.error("Error inserting/updating data:", error);
    }
  }
}

export default new OddsServiceV2();
