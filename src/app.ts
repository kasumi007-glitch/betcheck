import express from "express";
import OddsRoutes from "./routes/odds.routes";
import sequelize from "./config/database";
import dotenv from "dotenv";
import FetchGroupService from "./services/fetchAndDumpService";
import FetchOddService from "./services/fetchOddService ";
import FetchMatchService from "./services/fetchMatchService";


dotenv.config();

const app = express();
app.use(express.json());
app.use(OddsRoutes);

const processData = async () => {
  // await FetchGroupService.processData();
  await FetchOddService.processOddsData();
  // await FetchMatchService.processData();
};

processData().catch((error) => {
  console.error("Error running FetchGroupService processData:", error);
});

export default app;
