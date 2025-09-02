import { syncService } from "./syncService";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const SYNC_LEAGUES_CRON = process.env.SYNC_LEAGUES_CRON || "0 0 * * 0"; // Weekly on Sunday
const SYNC_FIXTURES_CRON = process.env.SYNC_FIXTURES_CRON || "0 0 * * *"; // Every day at midnight
const SYNC_ODDS_CRON = process.env.SYNC_ODDS_CRON || "*/15 * * * *"; // Every 15 minutes

export class Scheduler {
    init() {
        // Leagues sync - weekly
        cron.schedule(SYNC_LEAGUES_CRON, () => {
            console.log("⏰ Running scheduled leagues sync...");
            syncService.sync({ type: "leagues" });
        });

        // Fixtures sync - every day at midnight
        cron.schedule(SYNC_FIXTURES_CRON, () => {
            console.log("⏰ Running scheduled fixtures sync...");
            syncService.sync({ type: "fixtures" });
        });

        // Odds sync - every 1 hr
        cron.schedule(SYNC_ODDS_CRON, () => {
            console.log("⏰ Running scheduled odds sync...");
            syncService.sync({ type: "odds" });
        });

        console.log("🕒 Scheduler started with the following jobs:");
        console.log(`- Leagues sync: ${SYNC_LEAGUES_CRON}`);
        console.log(`- Fixtures sync: ${SYNC_FIXTURES_CRON}`);
        console.log(`- Odds sync: ${SYNC_ODDS_CRON}`);
    }
}

export const scheduler = new Scheduler();