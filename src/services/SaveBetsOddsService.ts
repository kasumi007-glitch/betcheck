import { db } from "../infrastructure/database/Database";

class SaveBetsOddsService {
  static async saveOdds() {
    try {
      console.log("🔄 Fetching best odds from all sources...");

      // 1️⃣ Get bookmakers and their preferred sources
      const bookmakersQuery = await db("bookmakers")
        .join("sources", "bookmakers.name", "sources.name") // ✅ Updated to use `sources` table
        .select(
          "bookmakers.id as bookmaker_id",
          "bookmakers.name as bookmaker_name",
          "bookmakers.country_code",
          "sources.id as source_id"
        );

      if (!bookmakersQuery.length) {
        console.log(
          "⚠️ No bookmakers or sources found. Skipping best odds calculation."
        );
        return;
      }

      // 2️⃣ Fetch odds from fixture_odds for all sources
      const fixtureOdds = await db("fixture_odds")
        .join("sources", "fixture_odds.source_id", "sources.id") // ✅ Updated to use `sources` table
        .select(
          "fixture_odds.fixture_id",
          "fixture_odds.external_source_fixture_id",
          "fixture_odds.coefficient",
          "fixture_odds.group_id",
          "fixture_odds.market_id",
          "fixture_odds.source_id",
          "sources.name as source_name"
        );

      if (!fixtureOdds.length) {
        console.log("⚠️ No fixture odds found. Skipping...");
        return;
      }

      // 3️⃣ Process best odds per fixture, market, and country
      const bestOddsMap = new Map();

      for (const {
        fixture_id,
        market_id,
        group_id,
        coefficient,
        source_id,
        source_name,
      } of fixtureOdds) {
        for (const { bookmaker_id, country_code } of bookmakersQuery) {
          const key = `${fixture_id}-${market_id}-${group_id}-${country_code}`;

          if (
            !bestOddsMap.has(key) ||
            coefficient > bestOddsMap.get(key).coefficient
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
            });
          }
        }
      }

      // 4️⃣ Insert or update best odds in `odds` table
      for (const bestOdd of bestOddsMap.values()) {
        const existingRecord = await db("odds")
          .where({
            fixture_id: bestOdd.fixture_id,
            market_id: bestOdd.market_id,
            group_id: bestOdd.group_id,
            country_code: bestOdd.country_code,
          })
          .first();

        if (existingRecord) {
          // Update if odds changed
          await db("odds")
            .where({
              fixture_id: bestOdd.fixture_id,
              market_id: bestOdd.market_id,
              group_id: bestOdd.group_id,
              country_code: bestOdd.country_code,
            })
            .update({
              previous_coefficient: existingRecord.coefficient,
              coefficient: bestOdd.coefficient,
              bookmaker_id: bestOdd.bookmaker_id,
              updated_at: db.fn.now(),
            });

          console.log(
            `🔄 Updated best odd for fixture ${bestOdd.fixture_id} in ${bestOdd.country_code} from ${bestOdd.source_name}`
          );
        } else {
          // Insert new best odd
          await db("odds").insert({
            fixture_id: bestOdd.fixture_id,
            market_id: bestOdd.market_id,
            group_id: bestOdd.group_id,
            bookmaker_id: bestOdd.bookmaker_id,
            country_code: bestOdd.country_code,
            coefficient: bestOdd.coefficient,
            previous_coefficient: null,
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
          });

          console.log(
            `✅ Inserted new best odd for fixture ${bestOdd.fixture_id} in ${bestOdd.country_code} from ${bestOdd.source_name}`
          );
        }
      }
    } catch (error) {
      console.error("❌ Error saving best odds:", error);
    }
  }
}

export default SaveBetsOddsService;
