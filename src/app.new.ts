import express from "express";
import cron from "node-cron";
import dotenv from "dotenv";
import OddsRoutes from "./routes/odds.routes";

import FetchPremierBetOddService from "./services/premierbet/FetchPremierBetOddService";
import FetchMegaPariOddService from "./services/mega-pari/AddMegaPariOddServiceV2";
import FetchYellowBetFixturesWithOddsService from "./services/yellowbet/FetchYellowBetFixturesWithOddsService";
import FetchBetclicFixturesService from "./services/betclic/FetchBetclicFixturesService";
import FetchOnebetOddsService from "./services/one-bet/FetchOnebetOddsService";
import Fetch22betFixturesWithOddsService from "./services/22bet/Fetch22betFixturesWithOddsService";
import FetchSunubetOddService from "./services/sunu-bet/FetchSunubetOddService";
import FetchSuperGoalOddService from "./services/super-goal/FetchSuperGoalOddService";

import FetchPremierBetFixtureService from "./services/premierbet/FetchFixturesService";
import FetchMegaPariFixturesService from "./services/mega-pari/FetchMegaPariFixturesService";
import FetchOnebetFixturesService from "./services/one-bet/FetchOnebetFixturesService";
import FetchSunubetFixturesService from "./services/sunu-bet/FetchSunubetFixturesService";
import FetchSuperGoalFixturesService from "./services/super-goal/FetchSuperGoalFixturesService";
import AddPremierBetOddService from "./services/premierbet/AddPremierBetOddService";
import FetchMegaPariFixturesWithOddsService from "./services/mega-pari/FetchMegaPariFixturesWithOddsService";
import Fetch1WinLeaguesWithFixturesService from "./services/1win/Fetch1WinLeaguesWithFixturesService";
import Add1WinOddService from "./services/1win/Add1WinOddService";
import BetMomoScraperService from "./services/bet-momo/BetMomoScraperService";
import Bet22333ScraperService from "./services/bet223/FetchBet223Service";
import AddBetclicOddService from "./services/betclic/AddBetclicOddService";
import SaveBetsOddsService from "./services/SaveBetsOddsService";

dotenv.config();

const appp = express();
appp.use(express.json());
appp.use(OddsRoutes);

// Read cron schedules from environment variables
const SYNC_ODDS_CRON = process.env.SYNC_ODDS_CRON || "0 * * * *"; // Default: every hour
const SYNC_FIXTURES_CRON = process.env.SYNC_FIXTURES_CRON || "0 0 * * *"; // Default: every day at midnight

// Function to run odds fetching services in parallel
const syncAllOdds = async () => {
  try {
    console.log(
      `Running syncAllOdds() at ${new Date().toLocaleTimeString()}...`
    );

    await Promise.all([
      Add1WinOddService.syncOdds(),
      Fetch22betFixturesWithOddsService.syncFixtures(false,true),
      BetMomoScraperService.scrape(), //scrapper
      Bet22333ScraperService.scrape(), //scrapepr
      AddBetclicOddService.syncOdds(),
      FetchMegaPariFixturesWithOddsService.syncFixtures(false, true),
      FetchOnebetOddsService.syncOdds(),
      AddPremierBetOddService.syncOdds(),
      FetchSunubetOddService.syncOdds(),
      FetchSuperGoalOddService.syncOdds(),
      FetchYellowBetFixturesWithOddsService.syncFixtures(false, true)
    ]);

    console.log("✅ All odds services completed successfully!");
    // ✅ Now fetch and save the aggregated odds
    console.log("🛠️ Fetching and saving bet odds...");
    await SaveBetsOddsService.saveOdds();
    console.log("✅ Bet odds successfully saved!");
  } catch (error) {
    console.error("❌ Error in syncAllOdds:", error);
  }
};

// Function to run fixture fetching services in parallel
const syncAllFixtures = async () => {
  try {
    console.log(
      `Running syncAllFixtures() at ${new Date().toLocaleTimeString()}...`
    );

    await Promise.all([
      Fetch1WinLeaguesWithFixturesService.syncLeaguesAndFixtures(false,true),
      Fetch22betFixturesWithOddsService.syncFixtures(true),
      FetchBetclicFixturesService.syncFixtures(),
      FetchMegaPariFixturesWithOddsService.syncFixtures(true),
      FetchOnebetFixturesService.syncFixtures(),
      FetchPremierBetFixtureService.syncFixtures(),
      FetchSunubetFixturesService.syncFixtures(),
      FetchSuperGoalFixturesService.syncFixtures(),
      FetchYellowBetFixturesWithOddsService.syncFixtures(true)
    ]);

    console.log("✅ All fixture services completed successfully!");
  } catch (error) {
    console.error("❌ Error in syncAllFixtures:", error);
  }
};

// Schedule syncOdds() every 2 minutes (for testing)
cron.schedule(SYNC_ODDS_CRON, syncAllOdds);

// Schedule syncFixtures() every day at midnight
cron.schedule(SYNC_FIXTURES_CRON, syncAllFixtures);

export default appp;
