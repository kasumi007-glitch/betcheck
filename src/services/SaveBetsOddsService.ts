import { db } from "../infrastructure/database/Database";

class SaveBetsOddsService {
  static async saveOdds() {
    try {
      console.log("🔄 Fetching best odds from all sources...");

      const bookmakersQuery = await this.getBookmakersQuery();
      if (!bookmakersQuery.length) {
        console.log("⚠️ No bookmakers or sources found. Skipping best odds calculation.");
        return;
      }

      const countrySourceMap = this.createCountrySourceMap(bookmakersQuery);

      const fixtureOdds = await this.getFixtureOdds();
      if (!fixtureOdds.length) {
        console.log("⚠️ No fixture odds found. Skipping...");
        return;
      }

      await this.processBestOdds(countrySourceMap, fixtureOdds);
    } catch (error) {
      console.error("❌ Error saving best odds:", error);
    }
  }

  static async getBookmakersQuery() {
    return await db("bookmakers")
      .join("sources", "bookmakers.source_name", "sources.name")
      .select(
        "bookmakers.id as bookmaker_id",
        "bookmakers.name as bookmaker_name",
        "bookmakers.country_code",
        "bookmakers.priority",
        "sources.id as source_id",
        "sources.name as source_name"
      );
  }

  static createCountrySourceMap(bookmakersQuery: any[]) {
    const countrySourceMap = new Map();
    for (const { source_id, country_code, bookmaker_id, priority } of bookmakersQuery) {
      if (!countrySourceMap.has(country_code)) {
        countrySourceMap.set(country_code, []);
      }
      countrySourceMap.get(country_code).push({ source_id, bookmaker_id, priority });
    }
    return countrySourceMap;
  }

  static async getFixtureOdds() {
    console.log("🔄 Fetching all fixture odds...");
    return await db("fixture_odds")
      .join("fixtures", "fixture_odds.fixture_id", "=", "fixtures.id")
      .join("sources", "fixture_odds.source_id", "sources.id")
      .select(
        "fixture_odds.fixture_id",
        "fixture_odds.external_source_fixture_id",
        "fixture_odds.coefficient",
        "fixture_odds.group_id",
        "fixture_odds.market_id",
        "fixture_odds.source_id",
        "sources.name as source_name"
      )
      .whereRaw("fixtures.date >= NOW()");
  }

  static async processBestOdds(countrySourceMap: Map<any, any>, fixtureOdds: any[]) {
    for (const [country_code, sources] of countrySourceMap.entries()) {
      console.log(`🔎 Processing best odds for country: ${country_code}`);

      const filteredFixtureOdds = fixtureOdds.filter((odd) =>
        sources.some((s: any) => s.source_id === odd.source_id)
      );

      if (!filteredFixtureOdds.length) {
        console.log(`⚠️ No relevant fixture odds for ${country_code}. Skipping...`);
        continue;
      }

      console.log(`✅ Found ${filteredFixtureOdds.length} relevant fixture odds for ${country_code}`);

      const bestOddsMap = this.findBestOdds(filteredFixtureOdds, sources, country_code);

      await this.insertOrUpdateBestOdds(bestOddsMap, country_code);
    }
  }

  static findBestOdds(filteredFixtureOdds: any[], sources: any[], country_code: string) {
    const bestOddsMap = new Map();

    for (const {
      fixture_id,
      market_id,
      group_id,
      coefficient,
      source_id,
      source_name,
    } of filteredFixtureOdds) {
      const sourceInfo = sources.find((s: any) => s.source_id === source_id);
      const { bookmaker_id, priority } = sourceInfo;

      const key = `${fixture_id}-${market_id}-${group_id}-${country_code}`;
      const existing = bestOddsMap.get(key);

      if (
        !existing ||
        coefficient > existing.coefficient ||
        (coefficient === existing.coefficient && priority < existing.priority)
      ) {
        bestOddsMap.set(key, {
          fixture_id,
          market_id,
          group_id,
          bookmaker_id,
          country_code,
          coefficient,
          previous_coefficient: null,
          source_id,
          source_name,
          priority,
        });
      }
    }

    return bestOddsMap;
  }

  static async insertOrUpdateBestOdds(bestOddsMap: Map<any, any>, country_code: string) {
    const BATCH_SIZE = 500;
    const insertData = Array.from(bestOddsMap.values()).map((bestOdd) => ({
      fixture_id: bestOdd.fixture_id,
      market_id: bestOdd.market_id,
      group_id: bestOdd.group_id,
      bookmaker_id: bestOdd.bookmaker_id,
      country_code: bestOdd.country_code,
      coefficient: bestOdd.coefficient,
      previous_coefficient: null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    }));

    if (insertData.length) {
      for (let i = 0; i < insertData.length; i += BATCH_SIZE) {
        const batch = insertData.slice(i, i + BATCH_SIZE);
        await db("odds")
          .insert(batch)
          .onConflict(["fixture_id", "market_id", "group_id", "country_code"])
          .merge({
            previous_coefficient: db.raw("odds.coefficient"),
            coefficient: db.raw("EXCLUDED.coefficient"),
            bookmaker_id: db.raw("EXCLUDED.bookmaker_id"),
            updated_at: db.fn.now(),
          });

        console.log(`✅ Successfully inserted/updated best odds for ${country_code}`);
      }
    }
  }
}

export default SaveBetsOddsService;
