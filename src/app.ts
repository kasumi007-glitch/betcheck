import express from "express";
import OddsRoutes from "./routes/odds.routes";
import sequelize from "./config/database";
import dotenv from "dotenv";
import FetchGroupService from "./services/fetchAndDumpService";
import FetchOddService from "./services/fetchOddService ";
import FetchMatchService from "./services/fetchMatchService";
import { openWebsiteWithProxy } from "./utils/puppeteer-proxy"; // ✅ Import Puppeteer Function
import FetchPremierBetOddService from "./services/premierbet/FetchPremierBetOddService";
import FetchPremierBetFixtureService from "./services/premierbet/FetchFixturesService";
import FetchPremierBetLeagueService from "./services/premierbet/FetchLeaguesService";
import AddPremierBetOddService from "./services/premierbet/AddPremierBetOddService";
import FetchMegaPariLeagueService from "./services/mega-pari/FetchMegaPariLeagueService";
import fetchMegaPariFixturesService from "./services/mega-pari/FetchMegaPariFixturesService";
import AddMegaPariOddService from "./services/mega-pari/AddMegaPariOddServiceV2";
import fetchMegaPariFixturesWithOddsService from "./services/mega-pari/FetchMegaPariFixturesWithOddsService";

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

  await AddPremierBetOddService.init();
  await AddPremierBetOddService.syncOdds();

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
};

processData().catch((error) => {
  console.error("Error running FetchGroupService processData:", error);
});

export default app;
