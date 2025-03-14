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
import fetchGeniusBetLeagueService from "./services/geniusbet/FetchGeniusBetLeagueService";
import fetchGeniusBetFixturesWithOddsService from "./services/geniusbet/FetchGeniusBetFixturesWithOddsService";
import fetchGuineeGamesLeagueService from "./services/guinee-games/FetchGuineeGamesLeagueService";
import fetchGuineeGamesFixturesWithOddsService from "./services/guinee-games/FetchGuineeGamesFixturesWithOddsService";
import fetchAkwaBetLeagueService from "./services/akwabet/FetchAkwaBetLeagueService";
import fetchAkwaBetFixturesWithOddsService from "./services/akwabet/FetchAkwaBetFixturesWithOddsService";
import fetchBetPawaLeagueService from "./services/betpawa/FetchBetPawaLeagueService";
import fetchBetPawaFixturesWithOddsService from "./services/betpawa/FetchBetPawaFixturesWithOddsService";

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
    //
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

    // GeniusBet
    // await fetchGeniusBetLeagueService.init();
    // await fetchGeniusBetLeagueService.syncLeagues();
    //
    // await fetchGeniusBetFixturesWithOddsService.initialize();
    // await fetchGeniusBetFixturesWithOddsService.syncFixtures();

    // Guinee Games
    // await fetchGuineeGamesLeagueService.init();
    // await fetchGuineeGamesLeagueService.syncLeagues();

    // await fetchGuineeGamesFixturesWithOddsService.initialize();
    // await fetchGuineeGamesFixturesWithOddsService.syncFixtures();


    // AkwaBet
    // await fetchAkwaBetLeagueService.init();
    // await fetchAkwaBetLeagueService.syncLeagues();
    //
    // await fetchAkwaBetFixturesWithOddsService.initialize();
    // await fetchAkwaBetFixturesWithOddsService.syncFixtures();

    // BetPawa
    await fetchBetPawaLeagueService.init();
    await fetchBetPawaLeagueService.syncLeagues();
    //
    await fetchBetPawaFixturesWithOddsService.initialize();
    await fetchBetPawaFixturesWithOddsService.syncFixtures();
};

processData().catch((error) => {
    console.error("Error running FetchGroupService processData:", error);
});

export default app;