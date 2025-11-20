import { db } from "../infrastructure/database/Database";

interface SnapshotInput {
    group_id: number;
    market_id: number;
    fixture_id: number;
    source_id: number;
    external_source_fixture_id: string;
    coefficient: any; // bookmaker may send string/number/null
}

export class OddsSnapshotService {
    static async saveOrUpdate(snapshot: SnapshotInput) {
        const {
            group_id,
            market_id,
            fixture_id,
            source_id,
            external_source_fixture_id,
            coefficient: rawCoefficient,
        } = snapshot;

        // 🔒 Safely normalize coefficient
        const parsed = Number(rawCoefficient);
        if (isNaN(parsed)) {
            console.warn(
                `⚠️ Invalid coefficient skipped for fixture ${fixture_id} (got: ${rawCoefficient})`
            );
            return; // skip saving invalid odds
        }

        // Trim to 2 decimals
        const coefficient = Number(parsed.toFixed(2));

        const existing = await db("fixture_odds")
            .where({
                group_id,
                market_id,
                fixture_id,
                source_id,
                external_source_fixture_id,
            })
            .first();

        if (!existing) {
            await db("fixture_odds").insert({
                group_id,
                market_id,
                fixture_id,
                source_id,
                external_source_fixture_id,
                coefficient,
                updated_at: db.fn.now(),
            });
            console.log(`✅ Inserted new odd (${group_id}/${market_id}): ${coefficient}`);
        } else if (Number(existing.coefficient) !== coefficient) {
            await db("fixture_odds_history").insert({
                group_id,
                market_id,
                fixture_id,
                source_id,
                external_source_fixture_id,
                old_coefficient: existing.coefficient,
                new_coefficient: coefficient,
                changed_at: db.fn.now(),
            });

            await db("fixture_odds")
                .where("id", existing.id)
                .update({
                    coefficient,
                    updated_at: db.fn.now(),
                });

            console.log(`📝 Updated odd (${group_id}/${market_id}): ${existing.coefficient} → ${coefficient}`);
        } else {
            console.log(`⏭️ No change: ${group_id}/${market_id}: still ${coefficient}`);
        }
    }
}
