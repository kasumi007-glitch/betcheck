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
import BetMomoScraperV2Service from "./services/bet-momo/BetMomoScraperServiceV2";
import Bet22333ScraperService from "./services/bet223/FetchBet223Service";
import AddBetclicOddService from "./services/betclic/AddBetclicOddService";
import SaveBetsOddsService from "./services/SaveBetsOddsService";
import Fetch22betLeaguesService from "./services/22bet/Fetch22betLeaguesService";
import FetchBetclicLeaguesService from "./services/betclic/FetchBetclicLeaguesService";
import FetchMegaPariLeagueService from "./services/mega-pari/FetchMegaPariLeagueService";
import FetchPremierBetLeagueService from "./services/premierbet/FetchLeaguesService";
import FetchSunubetLeaguesService from "./services/sunu-bet/FetchSunubetLeaguesService";
import FetchSuperGoalLeaguesService from "./services/super-goal/FetchSuperGoalLeaguesServiceV2";
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
import Save1xBetLeaguesWithFixturesService from "./services/1xbet/Save1xBetLeaguesWithFixturesService";
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
import Save1WinLeaguesWithFixturesService from "./services/1win/Save1WinLeaguesWithFixturesService";
import Save22BetLeaguesWithFixturesService from "./services/22bet/Save22BetLeaguesWithFixturesService";
import SaveBetMomoLeaguesWithFixturesService from "./services/bet-momo/SaveBetMomoLeaguesWithFixturesService";
import { launchPremierBetWithProxy } from "./services/premierbet/LaunchPremierBetService";
import SaveBetclicLeaguesWithFixturesService from "./services/betclic/SaveBetclicLeaguesWithFixturesService";
import SaveSuperGoalLeaguesWithFixturesService from "./services/super-goal/SaveSuperGoalLeaguesWithFixturesService";
import SaveBet223LeaguesWithFixturesService from "./services/bet223/SaveBet223LeaguesWithFixturesService";
import SaveMelBetLeaguesWithFixturesService from "./services/melbet/SaveMelBetLeaguesWithFixturesService";
import SaveMegaPariLeaguesWithFixturesService from "./services/mega-pari/SaveMegaPariLeaguesWithFixturesService";
import SavePremierBetLeaguesWithFixturesService from "./services/premierbet/SavePremierBetLeaguesWithFixturesService";
import SaveSunubetLeaguesWithFixturesService from "./services/sunu-bet/SaveSunubetLeaguesWithFixturesService";
import SaveYellowBetLeaguesWithFixturesService from "./services/yellowbet/SaveYellowBetLeaguesWithFixturesService";
import Fetch1WinProLeagueService from "./services/1win-pro/Fetch1WinProLeaguesService";
import Fetch1WinProFixturesService from "./services/1win-pro/Fetch1WinProFixturesService";
import Fetch1WinProOddsService from "./services/1win-pro/Fetch1WinProOddsService";
import FetchMWosLeaguesService from "./services/zw/mwos/FetchMWosLeaguesService";
import FetchBWinnersLeaguesService from "./services/sl/bwinners/FetchBWinnersLeaguesService";
import FetchEliteBetLeaguesService from "./services/cg/elitebet/FetchEliteBetLeaguesService";
import FetchEliteBetFixturesService from "./services/cg/elitebet/FetchEliteBetFixturesService";
import { FetchEliteBetOddsService } from "./services/cg/elitebet/FetchEliteBetOddsService";
import Fetch888BetsLeaguesService from "./services/ao/888Bet/Fetch888BetsLeaguesService";
import Fetch888BetsFixturesService from "./services/ao/888Bet/Fetch888BetsFixturesService";
import { Fetch888BetsOddsService } from "./services/ao/888Bet/Fetch888BetsOddsService";
import FetchEBetLeaguesService from "./services/ao/ebet/FetchEBetLeaguesService";
import FetchEBetFixturesWithOddsService from "./services/ao/ebet/FetchEBetFixturesWithOddsService";
import FetchBWinnersFixturesService from "./services/sl/bwinners/FetchBWinnersFixturesService";
import FetchBWinnersOddsService from "./services/sl/bwinners/FetchBWinnersOddsService";
import FetchApolloGamesOddsService from "./services/cg/apollogames/FetchApolloGamesOddsService";
import FetchApolloGamesFixturesService from "./services/cg/apollogames/FetchApolloGamesFixturesService";
import FetchApolloGamesLeaguesService from "./services/cg/apollogames/FetchApolloGamesLeaguesService";
import FetchPlayongoOddsService from "./services/cg/playongo/FetchPlayongoOddsService";
import FetchPlayongoFixturesService from "./services/cg/playongo/FetchPlayongoFixturesService";
import FetchPlayongoLeaguesService from "./services/cg/playongo/FetchPlayongoLeaguesService";
import FetchMWosFixturesService from "./services/zw/mwos/FetchMWosFixturesService";
import FetchMWosOddsService from "./services/zw/mwos/FetchMWosOddsService";
import SaveMWosLeaguesWithFixturesService from "./services/zw/mwos/SaveMWosLeaguesWithFixturesService";

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

  const betMomoSources = ["AOMOBET", "AOAFRIBET", "AOELEPHANTBET", "AOBANTUBET", "BETMOMO", "SLELEPHANTBET", "ZWAFRICABET"];

  const results = await Promise.allSettled([
    Add1WinOddService.syncOdds(),
    Fetch22betFixturesWithOddsService.syncFixtures(false, true),
    AddBetclicOddService.syncOdds(),
    FetchMegaPariFixturesWithOddsService.syncFixtures(false, true),
    // FetchOnebetOddsService.syncOdds(),
    new AddPremierBetOddService().syncOdds("PREMIERBET"),
    FetchSunubetOddService.syncOdds(),
    FetchSuperGoalOddService.syncOdds(),
    FetchYellowBetFixturesWithOddsService.syncFixtures(false, true),
    // ...betMomoSources.map(src => new BetMomoScraperService().scrape(src)),

    // BetMomoScraperV2Service.scrape(), //scrapper
    new BetMomoScraperService().scrape("AOMOBET"),
    new BetMomoScraperService().scrape("AOAFRIBET"),
    new BetMomoScraperService().scrape("AOELEPHANTBET"),
    new BetMomoScraperService().scrape("AOBANTUBET"),
    new BetMomoScraperService().scrape("BETMOMO"),
    new BetMomoScraperService().scrape("SLELEPHANTBET"),
    new BetMomoScraperService().scrape("ZWAFRICABET"),

    Bet22333ScraperService.scrape(), //scrapepr
    FetchGeniusBetFixturesWithOddsService.syncFixtures(false, true),
    FetchGuineeGamesFixturesWithOddsService.syncFixtures(false, true),
    FetchAkwaBetFixturesWithOddsService.syncFixtures(false, true),
    FetchBetPawaFixturesWithOddsService.syncFixtures(false, true),
    Fetch1xBetFixturesWithOddsService.syncFixtures(false, true),
    FetchLineBetFixturesWithOddsService.syncFixtures(false, true),
    FetchParipesaFixturesWithOddsService.syncFixtures(false, true),
    FetchMelBetFixturesWithOddsService.syncFixtures(false, true),
    new Fetch1WinProOddsService().syncOdds(),

    //AO Odds
    new Fetch888BetsOddsService().syncOdds(), //scraper
    new FetchEBetFixturesWithOddsService().syncFixtures(false, true),

    //CG Odds
    new FetchEliteBetOddsService().syncOdds(),
    new FetchApolloGamesOddsService().syncOdds(),
    new FetchPlayongoOddsService().syncOdds(),

    //SL Odds;
    new FetchBWinnersOddsService().syncOdds(),

    //ZW Odds
    new FetchMWosOddsService().syncOdds(),
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
  await SaveBetsOddsService.saveOdds();
  console.log("✅ Bet odds successfully saved!");
};

// Function to run fixture fetching services in parallel
const syncAllFixtures = async () => {
  console.log(
    `Running syncAllFixtures() at ${new Date().toLocaleTimeString()}...`
  );

  const results = await Promise.allSettled([
    Fetch1WinLeaguesWithFixturesService.syncLeaguesAndFixtures(false, true), // on hold
    Fetch22betFixturesWithOddsService.syncFixtures(true), //on hold
    FetchBetclicFixturesService.syncFixtures(),
    FetchMegaPariFixturesWithOddsService.syncFixtures(true), //on hold
    // FetchOnebetFixturesService.syncFixtures(),
    FetchPremierBetFixtureService.syncFixtures(),
    FetchSunubetFixturesService.syncFixtures(),
    FetchSuperGoalFixturesService.syncFixtures(), //timeout error
    FetchYellowBetFixturesWithOddsService.syncFixtures(true), //on hold
    FetchGeniusBetFixturesWithOddsService.syncFixtures(true),
    FetchGuineeGamesFixturesWithOddsService.syncFixtures(true),
    FetchAkwaBetFixturesWithOddsService.syncFixtures(true), //proxy timeout error
    FetchBetPawaFixturesWithOddsService.syncFixtures(true),
    Fetch1xBetFixturesWithOddsService.syncFixtures(true),
    FetchLineBetFixturesWithOddsService.syncFixtures(true),
    FetchParipesaFixturesWithOddsService.syncFixtures(true),
    FetchMelBetFixturesWithOddsService.syncFixtures(true),

    new Fetch1WinProFixturesService().syncFixtures(),

    //AO Fixtures
    new Fetch888BetsFixturesService().syncFixtures(),
    new FetchEBetFixturesWithOddsService().syncFixtures(true),

    //CG Fixtures
    new FetchEliteBetFixturesService().syncFixtures(),
    new FetchApolloGamesFixturesService().syncFixtures(),
    new FetchPlayongoFixturesService().syncFixtures(),

    //SL Fixtures
    new FetchBWinnersFixturesService().syncFixtures(),

    //ZW Fixtures
    new FetchMWosFixturesService().syncFixtures(),
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
    Fetch1WinLeaguesWithFixturesService.syncLeaguesAndFixtures(true),
    Fetch22betLeaguesService.syncLeagues(),
    FetchBetclicLeaguesService.syncLeagues(),
    FetchMegaPariLeagueService.syncLeagues(),
    // FetchOnebetFixturesService.syncFixtures(),
    FetchPremierBetLeagueService.syncLeagues("PREMIERBET"),
    FetchSunubetLeaguesService.syncLeagues(),
    FetchSuperGoalLeaguesService.syncLeagues(),
    FetchYellowBetLeagueService.syncLeagues(),
    FetchGeniusBetLeagueService.syncLeagues(),
    FetchGuineeGamesLeagueService.syncLeagues(),
    FetchAkwaBetLeagueService.syncLeagues(),  //need check
    FetchBetPawaLeagueService.syncLeagues(),
    Fetch1xBetLeagueService.syncLeagues(),
    FetchLineBetLeagueService.syncLeagues(),
    FetchParipesaLeagueService.syncLeagues(),
    FetchMelBetLeagueService.syncLeagues(),

    new Fetch1WinProLeagueService().syncLeagues(),

    //AO Leagues
    new Fetch888BetsLeaguesService().syncLeagues(),
    new FetchEBetLeaguesService().syncLeagues(),

    //CG Leagues
    new FetchEliteBetLeaguesService().syncLeagues(),
    new FetchApolloGamesLeaguesService().syncLeagues(),
    new FetchPlayongoLeaguesService().syncLeagues(),

    //SL Leagues
    new FetchBWinnersLeaguesService().syncLeagues(),

    //ZW Leagues
    new FetchMWosLeaguesService().syncLeagues(),
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

  // const bettingService = new BettingApiService({
  //   headless: false, // Set to true in production
  //   proxyUrl: 'http://v2.proxyempire.io:5000', // Recommended for geo-restricted content
  //   proxyUsername: 'r_5bc8550750-country-zw-sid-b367c8dh',     // Your proxy username
  //   proxyPassword: '77dc4d16bf',     // Your proxy password
  //   timeout: 90000, // Longer timeout for Cloudflare challenges
  // });

  // const eventId = '357033571';
  // const eventData = await bettingService.scrapeEvent(eventId);

  // const scraper = new BettingScraper({
  //   baseUrl: 'https://betting.co.zw',
  //   proxy: {
  //     host: 'v2.proxyempire.io',
  //     port: 5000,
  //     username: 'r_5bc8550750-country-zw-sid-b367c8dh', // Optional
  //     password: '77dc4d16bf'  // Optional
  //   },
  //   headless: false // Set to true in production
  // });
  // const api = new BettingAPI();

  // try {
  //   await api.initialize();
  //   const result = await api.getSportsTree();

  //   if (result.success) {
  //     console.log('API Response:', result.data);
  //   } else {
  //     console.error('API Error:', result.error);
  //   }
  // } catch (error) {
  //   console.error('Initialization error:', error);
  // } finally {
  //   await api.close();
  // }

  console.log('Access result:');

  // new FetchMWosLeaguesService().syncLeagues();
  // new FetchMWosFixturesService().syncFixtures();
  // new FetchMWosOddsService().syncOdds();

  // SaveMWosLeaguesWithFixturesService.syncLeaguesAndFixtures();

  console.log("⏳ Running initial league sync...");
  // await syncAllLeagues();
  console.log("✅ Initial league sync done!");

  console.log("⏳ Running initial fixture sync...");
  // await syncAllFixtures();
  console.log("✅ Initial fixture sync done!");

  console.log("⏳ Running initial odds sync...");
  // await syncAllOdds();
  console.log("✅ Initial odds sync done!");
};

const runSourceJobSync = async () => {
  console.log(
    `⏳ Running save get sources... at ${new Date().toLocaleTimeString()}...`
  );

  const results = await Promise.allSettled([
    Save1WinLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    Save1xBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    Save22BetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    saveAkwaBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SaveBetMomoLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SaveBet223LeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SaveBetclicLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    saveBetPawaLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    saveGeniusBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    saveGuineeGamesLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    saveLineBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SaveMegaPariLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    saveMelBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    saveParipesaLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SavePremierBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SaveSunubetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SaveSuperGoalLeaguesWithFixturesService.syncLeaguesAndFixtures(),
    SaveYellowBetLeaguesWithFixturesService.syncLeaguesAndFixtures()
  ]);

  // await launchPremierBetWithProxy("https://www.bantubet.co.ao/en/sports/pre-match/event-view/Soccer");

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`❌ Source save ${index + 1} failed:`, result.reason);
    } else {
      console.log(`✅ Source save ${index + 1} completed.`);
    }
  });

  console.log("✅ Get source done!");
};

const runScheduleSync = async () => {
  //Schedule fixture sync
  cron.schedule(SYNC_FIXTURES_CRON, async () => {
    console.log("📅 Scheduled fixture sync started...");
    await syncAllFixtures();
  });

  // Schedule odds sync (ensuring it runs after fixtures sync)
  cron.schedule(SYNC_ODDS_CRON, async () => {
    console.log("⏳ Scheduled odds sync started...");
    await syncAllOdds();
  });

  // cron.schedule(SYNC_FIXTURES_CRON, async () => {
  //   console.log("📅 Scheduled source save started...");
  //   await runSourceJobSync();
  // });
};

// Run immediate sync
runScheduleSync();
// runInitialSync();
// runSourceJobSync();

app.get('/api/sync-leagues', async (req, res) => {
  try {
    syncAllLeagues();
    res.status(202).json({ message: "League sync started in background" });
  } catch (error) {
    console.error("Error starting league sync:", error);
    res.status(500).json({ error: "Failed to start sync" });
  }
});

app.get('/api/sync-fixtures', async (req, res) => {
  try {
    syncAllFixtures();
    res.status(202).json({ message: "Fixtures sync started in background" });
  } catch (error) {
    console.error("Error starting fixture sync:", error);
    res.status(500).json({ error: "Failed to start sync" });
  }
});

export default app;