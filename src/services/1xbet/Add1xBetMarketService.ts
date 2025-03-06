import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";

class Add1xBetMarketService {
  private readonly sourceName = "1xBet";
  private sourceId!: number;

  private readonly apiUrl =
    "https://v3.traincdn.com/genfiles/cms/betstemplates/bets_model_full_en_0.json";

  // ✅ **Market-to-Group Mapping**
  private readonly marketGroups = new Map<string, string>([
    // **Main**
    ["1X2", "Main"],
    ["Over / Under", "Main"],
    ["Both Teams to Score", "Main"],
  ]);

  async initialize() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
  }

  async syncMarkets() {
    console.log(`🚀 Fetching 1xBet market groups and markets...`);

    const response = await fetchFromApi(this.apiUrl);
    if (!response) {
      console.warn(`⚠️ No data received from 1xBet API.`);
      return;
    }

    const { markets } = this.processMarketData(response);
    if (markets.length) {
      await this.saveMarkets(markets);
    }

    console.log("✅ 1xBet market groups & markets synced successfully!");
  }

  private processMarketData(rawData: any) {
    const markets: any[] = [];

    Object.keys(rawData).forEach((categoryId) => {
      const category = rawData[categoryId];

      if (category.M) {
        Object.keys(category.M).forEach((marketId) => {
          const market = category.M[marketId];
          const assignedGroup = this.marketGroups.get(market.N) || "Others";

          markets.push({
            market_id: parseInt(marketId),
            market_name: market.N,
            group_id: market.G,
            category: category.C,
            assigned_group: assignedGroup,
            source_id: this.sourceId,
          });
        });
      }
    });

    return { markets };
  }

  private async saveMarkets(markets: any[]) {
    try {
      await db("markets")
        .insert(markets)
        .onConflict(["market_id", "source_id"])
        .ignore();

      console.log("✅ Markets inserted/updated.");
    } catch (error) {
      console.error("❌ Error saving markets:", error);
    }
  }
}

export default new Add1xBetMarketService();
