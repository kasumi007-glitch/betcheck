import express from "express";
import OddsRoutes from "./routes/odds.routes";
import sequelize from "./config/database";
import dotenv from "dotenv";
import FetchGroupService from "./services/fetchAndDumpService";
import FetchOddService from "./services/fetchOddService ";
import FetchMatchService from "./services/fetchMatchService";
import { openWebsiteWithProxy } from "./utils/puppeteer-proxy"; // ✅ Import Puppeteer Function
import FetchPremierBetOddService from "./services/premierbet/FetchPremierBetOddService";
import FetchCompetitionService from "./services/premierbet/FetchCompetitionService";
import FetchMatchLeagueService from "./services/premierbet/FetchMatchLeagueService";
import AddPremierBetOddService from "./services/premierbet/AddPremierBetOddService";

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
  // await FetchCompetitionService.syncCompetitions();
  // await FetchMatchLeagueService.syncLeagues();
  // await AddPremierBetOddService.syncOdds();
  // ✅ Open Website with Proxy (Puppeteer)
  // await openWebsiteWithProxy();
};

processData().catch((error) => {
  console.error("Error running FetchGroupService processData:", error);
});

export default app;
