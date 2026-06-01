
import app from "./api/app";
import express from "express";
import cron from "node-cron";
import dotenv from "dotenv";
import FetchYellowBetFixturesWithOddsService from "./services/yellowbet/FetchYellowBetFixturesWithOddsService";
// import FetchBetclicLeaguesService from "./services/betclic/FetchBetclicLeaguesService";
// import FetchBetclicFixturesService from "./services/betclic/FetchBetclicFixturesService";
// import AddBetclicOddService from "./services/betclic/AddBetclicOddService";
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
import Fetch1WinLeaguesWithFixturesService from "./services/1win/Fetch1WinLeaguesWithFixturesService";
import Add1WinOddService from "./services/1win/Add1WinOddService";
import BetMomoScraperService from "./services/bet-momo/BetMomoScraperService";
import BetMomoScraperV2Service from "./services/bet-momo/BetMomoScraperServiceV2";
import Bet22333ScraperService from "./services/bet223/FetchBet223Service";
import SaveBetsOddsService from "./services/SaveBetsOddsService";
import Fetch22betLeaguesService from "./services/22bet/Fetch22betLeaguesService";
import FetchMegaPariLeagueService from "./services/mega-pari/FetchMegaPariLeagueService";
import FetchMegaPariFixturesWithOddsService from "./services/mega-pari/FetchMegaPariFixturesWithOddsService";
import FetchPremierBetLeagueService from "./services/premierbet/FetchLeaguesService";
import FetchSunubetLeaguesService from "./services/sunu-bet/FetchSunubetLeaguesService";
import FetchSuperGoalLeaguesService from "./services/super-goal/FetchSuperGoalLeaguesServiceV2";
import FetchYellowBetLeagueService from "./services/yellowbet/FetchYellowBetLeagueService";

import FetchGeniusBetLeagueService from "./services/geniusbet/FetchGeniusBetLeagueService";
import FetchGeniusBetFixturesWithOddsService from "./services/geniusbet/FetchGeniusBetFixturesWithOddsService";
import FetchGuineeGamesLeagueService from "./services/guinee-games/FetchGuineeGamesLeagueService";
import FetchGuineeGamesFixturesWithOddsService from "./services/guinee-games/FetchGuineeGamesFixturesWithOddsService";
import FetchAkwaBetLeagueService from "./services/akwabet/FetchAkwaBetLeagueService";
import FetchAkwaBetFixturesService from "./services/akwabet/FetchAkwaBetFixturesService";
import FetchAkwaBetOddsService from "./services/akwabet/FetchAkwaBetOddsService";
import FetchBetPawaLeagueService from "./services/betpawa/FetchBetPawaLeagueService";
import Fetch1xBetLeagueService from "./services/1xbet/Fetch1xBetLeagueService";
import Fetch1xBetFixturesWithOddsService from "./services/1xbet/Fetch1xBetFixturesWithOddsService";
import FetchLineBetLeagueService from "./services/linebet/FetchLineBetLeagueService";
import FetchLineBetFixturesWithOddsService from "./services/linebet/FetchLineBetFixturesWithOddsService";
import FetchParipesaLeagueService from "./services/paripesa/FetchParipesaLeagueService";
import FetchParipesaFixturesWithOddsService from "./services/paripesa/FetchParipesaFixturesWithOddsService";
import FetchMelBetLeagueService from "./services/melbet/FetchMelBetLeagueService";
import FetchMelBetFixturesWithOddsService from "./services/melbet/FetchMelBetFixturesWithOddsService";
import FetchBetPawaFixturesWithOddsService from "./services/betpawa/FetchBetPawaFixturesWithOddsService";
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
import FetchBettomaxLeaguesService from "./services/sl/bettomax/FetchBettomaxLeaguesService";
import FetchBettomaxFixturesService from "./services/sl/bettomax/FetchBettomaxFixturesService";
import FetchBettomaxOddsService from "./services/sl/bettomax/FetchBettomaxOddsService";
import FetchCmBettomaxLeaguesService from "./services/cm/bettomax/FetchCmBettomaxLeaguesService";
import FetchCmBettomaxFixturesService from "./services/cm/bettomax/FetchCmBettomaxFixturesService";
import FetchCmBettomaxOddsService from "./services/cm/bettomax/FetchCmBettomaxOddsService";
import FetchAllPremierBetLeaguesService from "./services/ao/ao-premierbet/FetchAllPremierBetLeaguesService";
import FetchAllPremierBetFixturesService from "./services/ao/ao-premierbet/FetchAllPremierBetFixturesService";
import FetchAllPremierBetOddService from "./services/ao/ao-premierbet/FetchAllPremierBetOddService";
import SaveBetmomoLeaguesWithFixturesService from "./services/betmomo/SaveBetmomoLeaguesWithFixturesService";
import FetchBetmomoLeaguesService from "./services/betmomo/FetchBetmomoLeaguesService";
import FetchBetmomoFixturesService from "./services/betmomo/FetchBetmomoFixturesService";
import FetchBetmomoOddsService from "./services/betmomo/FetchBetmomoOddsService";
import SaveAkwaBetLeaguesWithFixturesService from "./services/akwabet/SaveAkwaBetLeaguesWithFixturesService";
import SaveCiBetclicLeaguesWithFixturesService from "./services/ci/betclic/SaveCiBetclicLeaguesWithFixturesService";
import FetchCiBetclicLeaguesService from "./services/ci/betclic/FetchCiBetclicLeaguesService";
import FetchCiBetclicFixturesService from "./services/ci/betclic/FetchCiBetclicFixturesService";
import FetchCiBetclicOddService from "./services/ci/betclic/FetchCiBetclicOddService";
import Save1WinProLeaguesWithFixturesService from "./services/1win-pro/Save1WinProLeaguesWithFixturesService";
import FetchCdBetwinnerLeagueService from "./services/cd/betwinner1/FetchCdBetwinnerLeagueService";
import FetchCdBetwinnerFixturesService from "./services/cd/betwinner1/FetchCdBetwinnerFixturesService";
import FetchCdBetwinnerOddsService from "./services/cd/betwinner1/FetchCdBetwinnerOddsService";
import SaveCdBetwinnerLeaguesWithFixturesService from "./services/cd/betwinner1/SaveCdBetwinnerLeaguesWithFixturesService";
import FetchCdWinnerBetLeaguesService from "./services/cd/winner-bet/FetchCdWinnerBetLeaguesService";
import FetchCdWinnerBetFixturesService from "./services/cd/winner-bet/FetchCdWinnerBetFixturesService";
import FetchCdWinnerBetOddsService from "./services/cd/winner-bet/FetchCdWinnerBetOddsService";
import SaveCdBetikaLeaguesWithFixturesService from "./services/cd/betika/SaveCdBetikaLeaguesWithFixturesService";
import FetchCdBetikaLeaguesService from "./services/cd/betika/FetchCdBetikaLeaguesService";
import FetchCdBetikaFixturesService from "./services/cd/betika/FetchCdBetikaFixturesService";
import FetchCdBetikaOddsService from "./services/cd/betika/FetchCdBetikaOddsService";
import SaveCdMojabetLeaguesWithFixturesService from "./services/cd/mojabet/SaveCdMojabetLeaguesWithFixturesService";
import FetchCdMojabetFixturesService from "./services/cd/mojabet/FetchCdMojabetFixturesService";
import FetchCdMojabetOddsService from "./services/cd/mojabet/FetchCdMojabetOddsService";
import SaveSnMojabetLeaguesWithFixturesService from "./services/sn/mojabet/SaveSnMojabetLeaguesWithFixturesService";
import FetchSnMojabetFixturesService from "./services/sn/mojabet/FetchSnMojabetFixturesService";
import FetchSnMojabetOddsService from "./services/sn/mojabet/FetchSnMojabetOddsService";

// dotenv.config();

// const app = express();
// app.use(express.json());

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
    // AddBetclicOddService.syncOdds(),
    FetchMegaPariFixturesWithOddsService.syncFixtures(false, true),
    // FetchOnebetOddsService.syncOdds(),
    // new AddPremierBetOddService().syncOdds("PREMIERBET"),
    new AddPremierBetOddService().syncOdds("ML_PREMIERBET"),
    new AddPremierBetOddService().syncOdds("SN_PREMIERBET"),
    new AddPremierBetOddService().syncOdds("CM_PREMIERBET"),
    new AddPremierBetOddService().syncOdds("GA_PREMIERBET"),
    // new AddPremierBetOddService().syncOdds("TG_PREMIERBET"),
    new AddPremierBetOddService().syncOdds("CG_PREMIERBET"),
    new AddPremierBetOddService().syncOdds("CD_PREMIERBET"),
    new AddPremierBetOddService().syncOdds("SL_PREMIERBET"),
    new AddPremierBetOddService().syncOdds("ZW_PREMIERBET"),
    FetchSunubetOddService.syncOdds(),
    FetchSuperGoalOddService.syncOdds(),
    FetchYellowBetFixturesWithOddsService.syncFixtures(false, true),
    // ...betMomoSources.map(src => new BetMomoScraperService().scrape(src)),

    // BetMomoScraperV2Service.scrape(), //scrapper

    //Old Betmomo
    // new BetMomoScraperService().scrape("AOMOBET"),
    // new BetMomoScraperService().scrape("AOAFRIBET"),
    // new BetMomoScraperService().scrape("AOELEPHANTBET"),
    // new BetMomoScraperService().scrape("AOBANTUBET"),
    // new BetMomoScraperService().scrape("BETMOMO"),
    // new BetMomoScraperService().scrape("SLELEPHANTBET"),
    // new BetMomoScraperService().scrape("ZWAFRICABET"),

    //Betmomo
    new FetchBetmomoOddsService().syncOdds("AOMOBET"),
    new FetchBetmomoOddsService().syncOdds("AOAFRIBET"),
    new FetchBetmomoOddsService().syncOdds("AOELEPHANTBET"),
    new FetchBetmomoOddsService().syncOdds("AOBANTUBET"),

    //CI
    new FetchBetmomoOddsService().syncOdds("BETMOMO"),
    new FetchCiBetclicOddService().syncOdds("CI_BETCLIC"),

    //SN
    new FetchCiBetclicOddService().syncOdds("SN_BETCLIC"),
    new FetchSnMojabetOddsService().syncOdds(),

    //BJ
    // new FetchCiBetclicOddService().syncOdds("BJ_BETCLIC"),

    new FetchBetmomoOddsService().syncOdds("SLELEPHANTBET"),
    new FetchBetmomoOddsService().syncOdds("ZWAFRICABET"),
    new FetchBetmomoOddsService().syncOdds("ML_BET223"),
    new FetchBetmomoOddsService().syncOdds("GA_BET223"),

    Bet22333ScraperService.scrape(), //scrapepr
    FetchGeniusBetFixturesWithOddsService.syncFixtures(false, true),
    FetchGuineeGamesFixturesWithOddsService.syncFixtures(false, true),
    new FetchAkwaBetOddsService().syncOdds(),
    FetchBetPawaFixturesWithOddsService.syncFixtures(false, true),
    Fetch1xBetFixturesWithOddsService.syncFixtures(false, true),
    FetchLineBetFixturesWithOddsService.syncFixtures(false, true),
    FetchParipesaFixturesWithOddsService.syncFixtures(false, true),
    FetchMelBetFixturesWithOddsService.syncFixtures(false, true),
    new Fetch1WinProOddsService().syncOdds(),

    //AO Odds
    new Fetch888BetsOddsService().syncOdds(), //scraper
    new FetchEBetFixturesWithOddsService().syncFixtures(false, true),
    new FetchAllPremierBetOddService().syncOdds("AO_PREMIERBET"),

    //CG Odds
    new FetchEliteBetOddsService().syncOdds(),
    new FetchApolloGamesOddsService().syncOdds(),
    // new FetchPlayongoOddsService().syncOdds(),

    //CM Odds
    new FetchCmBettomaxOddsService().syncOdds(),

    //SL Odds;
    new FetchBWinnersOddsService().syncOdds(),
    new FetchBettomaxOddsService().syncOdds(),

    //ZW Odds
    // new FetchMWosOddsService().syncOdds(),

    //CD Odds
    new FetchCdBetwinnerOddsService().syncOdds(),
    new FetchCdBetikaOddsService().syncOdds(),
    new FetchCdMojabetOddsService().syncOdds(),
    // new FetchCdWinnerBetOddsService().syncOdds(),
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
    // FetchBetclicFixturesService.syncFixtures(),
    FetchMegaPariFixturesWithOddsService.syncFixtures(true), //on hold
    // FetchOnebetFixturesService.syncFixtures(),
    new FetchPremierBetFixtureService().syncFixtures("ML_PREMIERBET"),
    new FetchPremierBetFixtureService().syncFixtures("SN_PREMIERBET"),
    new FetchPremierBetFixtureService().syncFixtures("CM_PREMIERBET"),
    new FetchPremierBetFixtureService().syncFixtures("GA_PREMIERBET"),
    // new FetchPremierBetFixtureService().syncFixtures("TG_PREMIERBET"),
    new FetchPremierBetFixtureService().syncFixtures("CG_PREMIERBET"),
    new FetchPremierBetFixtureService().syncFixtures("CD_PREMIERBET"),
    new FetchPremierBetFixtureService().syncFixtures("SL_PREMIERBET"),
    new FetchPremierBetFixtureService().syncFixtures("ZW_PREMIERBET"),
    FetchSunubetFixturesService.syncFixtures(),
    FetchSuperGoalFixturesService.syncFixtures(), //timeout error
    FetchYellowBetFixturesWithOddsService.syncFixtures(true), //on hold

    //Bemomo
    new FetchBetmomoFixturesService().syncFixtures("AOMOBET"),
    new FetchBetmomoFixturesService().syncFixtures("AOAFRIBET"),
    new FetchBetmomoFixturesService().syncFixtures("AOELEPHANTBET"),
    new FetchBetmomoFixturesService().syncFixtures("AOBANTUBET"),

    //CI
    new FetchBetmomoFixturesService().syncFixtures("BETMOMO"),
    new FetchCiBetclicFixturesService().syncFixtures("CI_BETCLIC"),

    //SN
    new FetchCiBetclicFixturesService().syncFixtures("SN_BETCLIC"),
    new FetchSnMojabetFixturesService().syncFixtures(),

    //BJ
    // new FetchCiBetclicFixturesService().syncFixtures("BJ_BETCLIC"),

    new FetchBetmomoFixturesService().syncFixtures("SLELEPHANTBET"),
    new FetchBetmomoFixturesService().syncFixtures("ZWAFRICABET"),
    new FetchBetmomoFixturesService().syncFixtures("ML_BET223"),
    new FetchBetmomoFixturesService().syncFixtures("GA_BET223"),

    FetchGeniusBetFixturesWithOddsService.syncFixtures(true),
    FetchGuineeGamesFixturesWithOddsService.syncFixtures(true),
    new FetchAkwaBetFixturesService().syncFixtures(), //proxy timeout error
    FetchBetPawaFixturesWithOddsService.syncFixtures(true),
    Fetch1xBetFixturesWithOddsService.syncFixtures(true),
    FetchLineBetFixturesWithOddsService.syncFixtures(true),
    FetchParipesaFixturesWithOddsService.syncFixtures(true),
    FetchMelBetFixturesWithOddsService.syncFixtures(true),

    new Fetch1WinProFixturesService().syncFixtures(),

    //AO Fixtures
    new Fetch888BetsFixturesService().syncFixtures(),
    new FetchEBetFixturesWithOddsService().syncFixtures(true),
    new FetchAllPremierBetFixturesService().syncFixtures("AO_PREMIERBET"),

    //CG Fixtures
    new FetchEliteBetFixturesService().syncFixtures(),
    new FetchApolloGamesFixturesService().syncFixtures(),
    // new FetchPlayongoFixturesService().syncFixtures(),

    //CM Fixtures
    new FetchCmBettomaxFixturesService().syncFixtures(),

    //SL Fixtures
    new FetchBWinnersFixturesService().syncFixtures(),
    new FetchBettomaxFixturesService().syncFixtures(),

    //ZW Fixtures
    // new FetchMWosFixturesService().syncFixtures(),

    //CD Fixtures
    new FetchCdBetwinnerFixturesService().syncFixtures(),
    new FetchCdBetikaFixturesService().syncFixtures(),
    // new FetchCdWinnerBetFixturesService().syncFixtures(),
    new FetchCdMojabetFixturesService().syncFixtures(),
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
    // FetchBetclicLeaguesService.syncLeagues(),
    FetchMegaPariLeagueService.syncLeagues(),
    // FetchOnebetFixturesService.syncFixtures(),
    new FetchPremierBetLeagueService().syncLeagues("ML_PREMIERBET"),
    new FetchPremierBetLeagueService().syncLeagues("SN_PREMIERBET"),
    new FetchPremierBetLeagueService().syncLeagues("CM_PREMIERBET"),
    new FetchPremierBetLeagueService().syncLeagues("GA_PREMIERBET"),
    // new FetchPremierBetLeagueService().syncLeagues("TG_PREMIERBET"),
    new FetchPremierBetLeagueService().syncLeagues("CG_PREMIERBET"),
    new FetchPremierBetLeagueService().syncLeagues("CD_PREMIERBET"),
    new FetchPremierBetLeagueService().syncLeagues("SL_PREMIERBET"),
    new FetchPremierBetLeagueService().syncLeagues("ZW_PREMIERBET"),
    FetchSunubetLeaguesService.syncLeagues(),
    FetchSuperGoalLeaguesService.syncLeagues(),
    FetchYellowBetLeagueService.syncLeagues(),

    //Betmomo

    new FetchBetmomoLeaguesService().syncLeagues("AOMOBET"),
    new FetchBetmomoLeaguesService().syncLeagues("AOAFRIBET"),
    new FetchBetmomoLeaguesService().syncLeagues("AOELEPHANTBET"),
    new FetchBetmomoLeaguesService().syncLeagues("AOBANTUBET"),

    //CI
    new FetchBetmomoLeaguesService().syncLeagues("BETMOMO"),
    new FetchCiBetclicLeaguesService().syncLeagues("CI_BETCLIC"),

    //SN
    new FetchCiBetclicLeaguesService().syncLeagues("SN_BETCLIC"),

    //BJ
    // new FetchCiBetclicLeaguesService().syncLeagues("BJ_BETCLIC"),

    new FetchBetmomoLeaguesService().syncLeagues("SLELEPHANTBET"),
    new FetchBetmomoLeaguesService().syncLeagues("ZWAFRICABET"),
    new FetchBetmomoLeaguesService().syncLeagues("ML_BET223"),
    new FetchBetmomoLeaguesService().syncLeagues("GA_BET223"),

    FetchGeniusBetLeagueService.syncLeagues(),
    FetchGuineeGamesLeagueService.syncLeagues(),
    new FetchAkwaBetLeagueService().syncLeagues(),  //need check
    FetchBetPawaLeagueService.syncLeagues(),
    Fetch1xBetLeagueService.syncLeagues(),
    FetchLineBetLeagueService.syncLeagues(),
    FetchParipesaLeagueService.syncLeagues(),
    FetchMelBetLeagueService.syncLeagues(),

    new Fetch1WinProLeagueService().syncLeagues(),

    //AO Leagues
    new Fetch888BetsLeaguesService().syncLeagues(),
    new FetchEBetLeaguesService().syncLeagues(),
    new FetchAllPremierBetLeaguesService().syncLeagues("AO_PREMIERBET"),

    //CG Leagues
    new FetchEliteBetLeaguesService().syncLeagues(),
    new FetchApolloGamesLeaguesService().syncLeagues(),
    // new FetchPlayongoLeaguesService().syncLeagues(),

    //CM Leagues
    new FetchCmBettomaxLeaguesService().syncLeagues(),

    //SL Leagues
    new FetchBWinnersLeaguesService().syncLeagues(),
    new FetchBettomaxLeaguesService().syncLeagues(),

    //ZW Leagues
    // new FetchMWosLeaguesService().syncLeagues(),

    //CD Leagues
    new FetchCdBetwinnerLeagueService().syncLeagues(),
    new FetchCdBetikaLeaguesService().syncLeagues(),
    // new FetchCdWinnerBetLeaguesService().syncLeagues(),
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
  // new FetchCdBetwinnerLeagueService().syncLeagues("BJ_BETCLIC");
  // new FetchCiBetclicFixturesService().syncFixtures("BJ_BETCLIC");
  // new FetchCiBetclicOddService().syncOdds("BJ_BETCLIC");

  // new FetchCdMojabetFixturesService().syncLeagues();
  // new FetchSnMojabetFixturesService().syncFixtures();
  // new FetchSnMojabetOddsService().syncOdds();
  // SaveSnMojabetLeaguesWithFixturesService.syncLeaguesAndFixtures();

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