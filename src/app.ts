import express from "express";
import cron from "node-cron";
import dotenv from "dotenv";
import FetchYellowBetFixturesWithOddsService from "./services/yellowbet/FetchYellowBetFixturesWithOddsService";
import FetchBetclicFixturesService from "./services/betclic/FetchBetclicFixturesService";
import FetchOnebetOddsService from "./services/one-bet/FetchOnebetOddsService";
import Fetch22betFixturesWithOddsService from "./services/22bet/Fetch22betFixturesWithOddsService";
import FetchSunubetOddService from "./services/sunu-bet/FetchSunubetOddService";
import FetchSuperGoalOddService from "./services/super-goal/FetchSuperGoalOddService";
import FetchPremierBetOddService from "./services/premierbet/FetchPremierBetOddService";
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
import Fetch22betLeaguesService from "./services/22bet/Fetch22betLeaguesService";
import FetchBetclicLeaguesService from "./services/betclic/FetchBetclicLeaguesService";
import FetchMegaPariLeagueService from "./services/mega-pari/FetchMegaPariLeagueService";
import FetchPremierBetLeagueService from "./services/premierbet/FetchLeaguesService";
import FetchSunubetLeaguesService from "./services/sunu-bet/FetchSunubetLeaguesService";
import FetchSuperGoalLeaguesService from "./services/super-goal/FetchSuperGoalLeaguesService";
import FetchYellowBetLeagueService from "./services/yellowbet/FetchYellowBetLeagueService";

import FetchGeniusBetLeagueService from "./services/geniusbet/FetchGeniusBetLeagueService";
import FetchGeniusBetFixturesWithOddsService from "./services/geniusbet/FetchGeniusBetFixturesWithOddsService";
import saveGeniusBetLeaguesWithFixturesService from "./services/geniusbet/SaveGeniusBetLeaguesWithFixturesService";
import FetchGuineeGamesLeagueService from "./services/guinee-games/FetchGuineeGamesLeagueService";
import FetchGuineeGamesFixturesWithOddsService from "./services/guinee-games/FetchGuineeGamesFixturesWithOddsService";
import saveGuineeGamesLeaguesWithFixturesService
    from "./services/guinee-games/SaveGuineeGamesLeaguesWithFixturesService";
import saveAkwaBetLeaguesWithFixturesService from "./services/akwabet/SaveAkwaBetLeaguesWithFixturesService";
import saveBetPawaLeaguesWithFixturesService from "./services/betpawa/SaveBetPawaLeaguesWithFixturesService";
import save1xBetLeaguesWithFixturesService from "./services/1xbet/Save1xBetLeaguesWithFixturesService";
import saveParipesaLeaguesWithFixturesService from "./services/paripesa/SaveParipesaLeaguesWithFixturesService";
import saveLineBetLeaguesWithFixturesService from "./services/linebet/SaveLineBetLeaguesWithFixturesService";
import saveMelBetLeaguesWithFixturesService from "./services/melbet/SaveMelBetLeaguesWithFixturesService";
import FetchAkwaBetLeagueService from "./services/akwabet/FetchAkwaBetLeagueService";
import FetchBetPawaLeagueService from "./services/betpawa/FetchBetPawaLeagueService";
import Fetch1xBetLeagueService from "./services/1xbet/Fetch1xBetLeagueService";
import FetchLineBetLeagueService from "./services/linebet/FetchLineBetLeagueService";
import FetchParipesaLeagueService from "./services/paripesa/FetchParipesaLeagueService";
import FetchMelBetLeagueService from "./services/melbet/FetchMelBetLeagueService";
import FetchAkwaBetFixturesWithOddsService from "./services/akwabet/FetchAkwaBetFixturesWithOddsService";
import FetchBetPawaFixturesWithOddsService from "./services/betpawa/FetchBetPawaFixturesWithOddsService";
import Fetch1xBetFixturesWithOddsService from "./services/1xbet/Fetch1xBetFixturesWithOddsService";
import FetchLineBetFixturesWithOddsService from "./services/linebet/FetchLineBetFixturesWithOddsService";
import FetchParipesaFixturesWithOddsService from "./services/paripesa/FetchParipesaFixturesWithOddsService";
import FetchMelBetFixturesWithOddsService from "./services/melbet/FetchMelBetFixturesWithOddsService";

dotenv.config();

const app = express();
app.use(express.json());

// Read cron schedules from environment variables
const SYNC_ODDS_CRON = process.env.SYNC_ODDS_CRON ?? "0 * * * *"; // Default: every hour
const SYNC_FIXTURES_CRON = process.env.SYNC_FIXTURES_CRON ?? "0 0 * * *"; // Default: every day at midnight

// Function to run odds fetching services in parallel
const syncAllOdds = async () => {
  console.log(
    `Running syncAllOdds() at ${new Date().toLocaleTimeString()}...`
  );

  const results = await Promise.allSettled([
    // Add1WinOddService.syncOdds(),
    // Fetch22betFixturesWithOddsService.syncFixtures(false, true),
    // AddBetclicOddService.syncOdds(),
    // FetchMegaPariFixturesWithOddsService.syncFixtures(false, true),
    // // // // FetchOnebetOddsService.syncOdds(),
    // AddPremierBetOddService.syncOdds(),
    // FetchSunubetOddService.syncOdds(),
    // FetchSuperGoalOddService.syncOdds(),
    // FetchYellowBetFixturesWithOddsService.syncFixtures(false, true),
    // BetMomoScraperService.scrape(), //scrapper
    // Bet22333ScraperService.scrape(), //scrapepr
    //   FetchGeniusBetFixturesWithOddsService.syncFixtures(false, true),
    //   FetchGuineeGamesFixturesWithOddsService.syncFixtures(false, true),
    //   FetchAkwaBetFixturesWithOddsService.syncFixtures(false, true),
      FetchBetPawaFixturesWithOddsService.syncFixtures(false, true),
    //   Fetch1xBetFixturesWithOddsService.syncFixtures(false, true),
    //   FetchLineBetFixturesWithOddsService.syncFixtures(false, true),
    //   FetchParipesaFixturesWithOddsService.syncFixtures(false, true),
    // FetchMelBetFixturesWithOddsService.syncFixtures(false, true)

  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`❌ Odds sync ${index + 1} failed:`, result.reason);
    } else {
      console.log(`✅ Odds sync ${index + 1} completed.`);
    }
  });
  console.log(
    `All odds services completed successfully! at ${new Date().toLocaleTimeString()}...`
  );
  // console.log("✅ All odds services completed successfully!");
  // ✅ Now fetch and save the aggregated odds
  console.log("🛠️ Fetching and saving bet odds...");
  // await SaveBetsOddsService.saveOdds();
  console.log("✅ Bet odds successfully saved!");
};

// Function to run fixture fetching services in parallel
const syncAllFixtures = async () => {
  console.log(
    `Running syncAllFixtures() at ${new Date().toLocaleTimeString()}...`
  );

  const results = await Promise.allSettled([
    // Fetch1WinLeaguesWithFixturesService.syncLeaguesAndFixtures(false, true), // on hold
    // Fetch22betFixturesWithOddsService.syncFixtures(true), //on hold
    // FetchBetclicFixturesService.syncFixtures(),
    // FetchMegaPariFixturesWithOddsService.syncFixtures(true), //on hold
    // // // FetchOnebetFixturesService.syncFixtures(),
    // FetchPremierBetFixtureService.syncFixtures(),
    // FetchSunubetFixturesService.syncFixtures(),
    // FetchSuperGoalFixturesService.syncFixtures(),
    // FetchYellowBetFixturesWithOddsService.syncFixtures(true), //on hold
    //   FetchGeniusBetFixturesWithOddsService.syncFixtures(true),
    //   FetchGuineeGamesFixturesWithOddsService.syncFixtures(true),
    //   FetchAkwaBetFixturesWithOddsService.syncFixtures(true),
      FetchBetPawaFixturesWithOddsService.syncFixtures(true),
    //   Fetch1xBetFixturesWithOddsService.syncFixtures(true),
    //   FetchLineBetFixturesWithOddsService.syncFixtures(true),
    //   FetchParipesaFixturesWithOddsService.syncFixtures(true),
      // FetchMelBetFixturesWithOddsService.syncFixtures(true)
  ]);


  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`❌ Fixture sync ${index + 1} failed:`, result.reason);
    } else {
      console.log(`✅ Fixture sync ${index + 1} completed.`);
    }
  });

  console.log("✅ All fixture services completed successfully!");
};

// Function to run league fetching services in parallel
const syncAllLeagues = async () => {
  console.log(
    `Running syncAllLeagues() at ${new Date().toLocaleTimeString()}...`
  );

  const results = await Promise.allSettled([
    // Fetch1WinLeaguesWithFixturesService.syncLeaguesAndFixtures(true, true),
    // Fetch22betLeaguesService.syncLeagues(),
    // FetchBetclicLeaguesService.syncLeagues(),
    // FetchMegaPariLeagueService.syncLeagues(),
    // // // FetchOnebetFixturesService.syncFixtures(),
    // FetchPremierBetLeagueService.syncLeagues(),
    // FetchSunubetLeaguesService.syncLeagues(),
    // FetchSuperGoalLeaguesService.syncLeagues(),
    // FetchYellowBetLeagueService.syncLeagues(),
    //   FetchGeniusBetLeagueService.syncLeagues(),
    //   FetchGuineeGamesLeagueService.syncLeagues(),
    //   FetchAkwaBetLeagueService.syncLeagues(),
      FetchBetPawaLeagueService.syncLeagues(),
    //   Fetch1xBetLeagueService.syncLeagues(),
    //   FetchLineBetLeagueService.syncLeagues(),
    //   FetchParipesaLeagueService.syncLeagues(),
      // FetchMelBetLeagueService.syncLeagues()
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`❌ Leagues sync ${index + 1} failed:`, result.reason);
    } else {
      console.log(`✅ Leagues sync ${index + 1} completed.`);
    }
  });

  console.log("✅ All league services completed successfully!");
};

// Run fixture sync first, then odds sync immediately
const runInitialSync = async () => {
  // await saveMelBetLeaguesWithFixturesService.syncLeaguesAndFixtures();

  console.log("⏳ Running initial league sync...");
  await syncAllLeagues();
  console.log("✅ Initial league sync done!");

  console.log("⏳ Running initial fixture sync...");
  await syncAllFixtures();
  console.log("✅ Initial fixture sync done!");

  console.log("⏳ Running initial odds sync...");
  await syncAllOdds();
  console.log("✅ Initial odds sync done!");

};

// Schedule fixture sync
cron.schedule(SYNC_FIXTURES_CRON, async () => {
  console.log("📅 Scheduled fixture sync started...");
  await syncAllFixtures();
});

// Schedule odds sync (ensuring it runs after fixtures sync)
cron.schedule(SYNC_ODDS_CRON, async () => {
  console.log("⏳ Scheduled odds sync started...");
  await syncAllOdds();
});

// Run immediate sync
runInitialSync();

export default app;
