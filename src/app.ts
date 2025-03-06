import express from "express";
import OddsRoutes from "./routes/odds.routes";
import sequelize from "./config/database";
import dotenv from "dotenv";
import FetchGroupService from "./services/fetchAndDumpService";
import FetchOddService from "./services/fetchOddService ";
import FetchMatchService from "./services/fetchMatchService";
// import { openWebsiteWithProxy } from "./utils/puppeteer-proxy"; // ✅ Import Puppeteer Function
import FetchPremierBetOddService from "./services/premierbet/FetchPremierBetOddService";
import FetchPremierBetFixtureService from "./services/premierbet/FetchFixturesService";
import FetchPremierBetLeagueService from "./services/premierbet/FetchLeaguesService";
import AddPremierBetOddService from "./services/premierbet/AddPremierBetOddService";
import FetchMegaPariLeagueService from "./services/mega-pari/FetchMegaPariLeagueService";
import fetchMegaPariFixturesService from "./services/mega-pari/FetchMegaPariFixturesService";
import AddMegaPariOddService from "./services/mega-pari/AddMegaPariOddServiceV2";
import fetch1xBetFixturesWithOddsService from "./services/1xbet/Fetch1xBetFixturesWithOddsService";
import fetch1xBetLeagueService from "./services/1xbet/Fetch1xBetLeagueService";
import fetchMegaPariFixturesWithOddsService from "./services/mega-pari/FetchMegaPariFixturesWithOddsService"
import fetchLineBetLeagueService from "./services/linebet/FetchLineBetLeagueService";
import fetchLineBetFixturesWithOddsService from "./services/linebet/FetchLineBetFixturesWithOddsService";
import fetchParipesaLeagueService from "./services/paripesa/FetchParipesaLeagueService";
import fetchParipesaFixturesWithOddsService from "./services/paripesa/FetchParipesaFixturesWithOddsService";
import fetchMelBetLeagueService from "./services/melbet/FetchMelBetLeagueService";
import fetchMelBetFixturesWithOddsService from "./services/melbet/FetchMelBetFixturesWithOddsService";

dotenv.config();

const app = express();
app.use(express.json());
app.use(OddsRoutes);

const processData = async () => {
  // await FetchGroupService.processData();
  // await FetchOddService.processOddsData();
  // await FetchMatchService.processData();

  //PremierBet
  // await FetchPremierBetOddService.syncOdds();

  // await FetchPremierBetLeagueService.init();
  // await FetchPremierBetLeagueService.syncLeagues();

  // await FetchPremierBetFixtureService.init();
  // await FetchPremierBetFixtureService.syncFixtures();

  // await AddPremierBetOddService.init();
  // await AddPremierBetOddService.syncOdds();

  //MegaPari
  // await FetchMegaPariLeagueService.init();
  // await FetchMegaPariLeagueService.syncLeagues();

  // await fetchMegaPariFixturesService.initialize();
  // await fetchMegaPariFixturesService.syncFixtures();

  // await fetchMegaPariFixturesWithOddsService.initialize();
  // await fetchMegaPariFixturesWithOddsService.syncFixtures();

  // await AddMegaPariOddService.initialize();
  // await AddMegaPariOddService.syncOdds();
  // ✅ Open Website with Proxy (Puppeteer)
  // await openWebsiteWithProxy();

  // 1xBet
  // await fetch1xBetLeagueService.init();
  // await fetch1xBetLeagueService.syncLeagues();
  //
  // await fetch1xBetFixturesWithOddsService.initialize();
  // await fetch1xBetFixturesWithOddsService.syncFixtures();

  // Paripesa
  // await fetchParipesaLeagueService.init();
  // await fetchParipesaLeagueService.syncLeagues();
  //
  // await fetchParipesaFixturesWithOddsService.initialize();
  // await fetchParipesaFixturesWithOddsService.syncFixtures();

  // LineBet
  // await fetchLineBetLeagueService.init();
  // await fetchLineBetLeagueService.syncLeagues();
  //
  // await fetchLineBetFixturesWithOddsService.initialize();
  // await fetchLineBetFixturesWithOddsService.syncFixtures();

  // MelBet
  // await fetchMelBetLeagueService.init();
  // await fetchMelBetLeagueService.syncLeagues();
  //
  // await fetchMelBetFixturesWithOddsService.initialize();
  // await fetchMelBetFixturesWithOddsService.syncFixtures();
};

processData().catch((error) => {
  console.error("Error running FetchGroupService processData:", error);
});

export default app;
