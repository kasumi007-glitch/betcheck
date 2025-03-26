import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";

class AddMegaPariMarketService {
  private readonly sourceName = "MEGAPARI";
  private sourceId!: number;

  private readonly apiUrl =
    "https://v3.traincdn.com/genfiles/cms/betstemplates/bets_model_full_en_0.json";

  // ✅ **Market-to-Group Mapping**
  private readonly marketGroups = new Map<string, string>([
    // **Main**
    ["1X2", "Main"],
    ["Over / Under", "Main"],
    ["Both Teams to Score", "Main"],
    ["Double Chance", "Main"],
    ["Draw No Bet", "Main"],
    ["Handicap", "Main"],
    ["Halftime / Fulltime", "Main"],
    ["Highest Scoring Half", "Main"],
    ["Correct Score", "Main"],
    ["First 10 Minutes", "Main"],
    ["First Team To Score", "Main"],
    ["Last Team To Score", "Main"],
    ["Highest scoring half - Home team", "Main"],
    ["Highest scoring half - Away team", "Main"],

    // **Goal**
    ["Over / Under", "Goal"],
    ["Goals Home Team", "Goal"],
    ["Goals Away Team", "Goal"],
    ["Odd / Even goals", "Goal"],
    ["Odd / Even - Home team", "Goal"],
    ["Odd / Even – Away team", "Goal"],
    ["Over/Under home team goals", "Goal"],
    ["Over/Under away team goals", "Goal"],
    ["In Which 10min Interval will the First Goal be scored", "Goal"],
    ["In Which 15min Interval will the First Goal be scored", "Goal"],
    ["Clean Sheet Home Team", "Goal"],
    ["Clean Sheet Away Team", "Goal"],
    ["Team To Score", "Goal"],
    ["Both Halves Over 1.5 Goals", "Goal"],
    ["Both Halves Under 1.5 Goals", "Goal"],
    ["Home To Score In Both Halves", "Goal"],
    ["Away To Score In Both Halves", "Goal"],

    // **1st Half**
    ["1st half – 3 way", "1st Half"],
    ["1st Half  Over/Under", "1st Half"],
    ["1st Half - Double Chance", "1st Half"],
    ["1st half - Over / Under", "1st Half"],
    ["1st half - Both teams to score", "1st Half"],
    ["1st Half  Over/Under Home Team -", "1st Half"],
    ["1st Half Over/Under Away Team", "1st Half"],
    ["1st half - Draw No Bet", "1st Half"],
    ["1st Half First  Team to score", "1st Half"],
    ["1st Half  Double Chance + Both Team to Score", "1st Half"],
    ["1st Half - Matchbet + Both Teams To Score", "1st Half"],
    ["1st half - 3 way + Over / Under", "1st Half"],
    ["1st Half - Exact Goals", "1st Half"],
    ["1st Half - Clean sheet home team", "1st Half"],
    ["1st Half - Clean sheet away team", "1st Half"],
    ["1st Half - Handicap", "1st Half"],
    ["1st half - Correct Score", "1st Half"],

    // **2nd Half**
    ["2nd half - 3-way", "2nd Half"],
    ["2nd half -  Over / Under", "2nd Half"],
    ["2nd half - Double Chance", "2nd Half"],
    ["2nd half - Both teams to score", "2nd Half"],
    ["2nd half - Draw No Bet", "2nd Half"],
    ["2nd Half - Goals", "2nd Half"],
    ["2nd  Half - First Team to score", "2nd Half"],
    ["2nd half - Over/Under Home team goals", "2nd Half"],
    ["2nd half - Over/Under Away team goals", "2nd Half"],
    ["2nd Half - Handicap", "2nd Half"],

    // **Combo**
    ["Matchbet + Both  Teams to Score", "Combo"],
    ["Both Teams to Score + Totals", "Combo"],
    ["Matchbet + Over/Under", "Combo"],
    ["Matchflow", "Combo"],
    ["Both teams to score - 1st half + 2nd half", "Combo"],
    ["Double Chance and Total", "Combo"],
    ["Double Chance and Both Team to Score", "Combo"],
    ["Multiscores", "Combo"],

    // **Corners**
    ["Total Corners", "Corners"],
    ["Corner Matchbet", "Corners"],
    ["Corner Handicap", "Corners"],
    ["1st half - Total Corners", "Corners"],
    ["First Corner", "Corners"],
    ["Odd / Even Corners", "Corners"],

    // **Bookings**
    ["Total Match Cards", "Bookings"],
    ["Total Home Cards", "Bookings"],
    ["Total Away Cards", "Bookings"],
    ["Cards Matchbet", "Bookings"],
    ["Exact Match Cards", "Bookings"],
    ["1st Team Card", "Bookings"],
    ["1st half – Total Match Cards", "Bookings"],
    ["Player Sent Off", "Bookings"],
    ["1st half - Player sent off", "Bookings"],
    ["Player sent off - Home team", "Bookings"],
    ["Player sent off - Away team", "Bookings"],

    // **Goal Scorers**
    ["Goal Scorers", "Goal Scorers"],

    // **Others**
    ["Home to win both halves", "Others"],
    ["Home to win either half", "Others"],
    ["Away to win both halves", "Others"],
    ["Away to win either half", "Others"],
    ["Home No Bet", "Others"],
    ["Away No Bet", "Others"],
    ["Home win Nil", "Others"],
    ["Away Win To Nil", "Others"],
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
    console.log(`🚀 Fetching MegaPari market groups and markets...`);

    const response = await fetchFromApi(this.apiUrl);
    if (!response) {
      console.warn(`⚠️ No data received from MegaPari API.`);
      return;
    }

    const { markets } = this.processMarketData(response);
    if (markets.length) {
      await this.saveMarkets(markets);
    }

    console.log("✅ MegaPari market groups & markets synced successfully!");
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

export default new AddMegaPariMarketService();
