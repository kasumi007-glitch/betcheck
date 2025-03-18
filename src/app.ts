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
import FetchYellowBetLeagueService from "./services/yellowbet/FetchYellowBetLeagueService";
import FetchYellowBetFixturesWithOddsService from "./services/yellowbet/FetchYellowBetFixturesWithOddsService";
import FetchBetclicLeaguesService from "./services/betclic/FetchBetclicLeaguesService";
import FetchBetclicFixturesService from "./services/betclic/FetchBetclicFixturesService";
import AddBetclicOddService from "./services/betclic/AddBetclicOddService";
import Fetch1WinLeaguesWithFixturesService from "./services/1win/Fetch1WinLeaguesWithFixturesService";
import Add1WinOddService from "./services/1win/Add1WinOddService";
import Bet22333ScraperService from "./services/bet223/FetchBet223Service";
import BetMomoScraperService from "./services/bet-momo/BetMomoScraperService";
import FetchOnebetLeaguesService from "./services/one-bet/FetchOnebetLeaguesService";
import FetchOnebetFixturesService from "./services/one-bet/FetchOnebetFixturesService";
import FetchOnebetOddsService from "./services/one-bet/FetchOnebetOddsService";
import Fetch22betLeaguesService from "./services/22bet/Fetch22betLeaguesService";
import Fetch22betFixturesWithOddsService from "./services/22bet/Fetch22betFixturesWithOddsService";
import FetchSunubetLeaguesService from "./services/sunu-bet/FetchSunubetLeaguesService";
import FetchSunubetFixturesService from "./services/sunu-bet/FetchSunubetFixturesService";
import FetchSunubetOddService from "./services/sunu-bet/FetchSunubetOddService";
import GetAccessTokenService from "./services/super-goal/GetAccessTokenService";
import FetchSuperGoalLeaguesService from "./services/super-goal/FetchSuperGoalLeaguesService";
import FetchSuperGoalFixturesWithOddsService from "./services/super-goal/FetchSuperGoalFixturesWithOddsService";
import FetchSuperGoalOddService from "./services/super-goal/FetchSuperGoalOddService";
import FetchSuperGoalFixturesService from "./services/super-goal/FetchSuperGoalFixturesService";
import Save1WinLeaguesWithFixturesService from "./services/1win/Save1WinLeaguesWithFixturesService";
import Save22BetLeaguesWithFixturesService from "./services/22bet/Save22BetLeaguesWithFixturesService";
import SaveBetclicLeaguesWithFixturesService from "./services/betclic/SaveBetclicLeaguesWithFixturesService";
import SaveMegaPariLeaguesWithFixturesService from "./services/mega-pari/SaveMegaPariLeaguesWithFixturesService";
import SaveOneBetLeaguesWithFixturesService from "./services/one-bet/SaveOneBetLeaguesWithFixturesService";
import SavePremierBetLeaguesWithFixturesService from "./services/premierbet/SavePremierBetLeaguesWithFixturesService";
import SaveSunubetLeaguesWithFixturesService from "./services/sunu-bet/SaveSunubetLeaguesWithFixturesService";
import cron from "node-cron";
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
import fetch1xBetFixturesWithOddsService from "./services/1xbet/Fetch1xBetFixturesWithOddsService";
import fetch1xBetLeagueService from "./services/1xbet/Fetch1xBetLeagueService";

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
    // await FetchPremierBetLeagueService.syncLeagues(); //league
    // await FetchPremierBetFixtureService.init();
    await FetchPremierBetFixtureService.syncFixtures(); //fixture
    // await AddPremierBetOddService.init();
    // await AddPremierBetOddService.syncOdds();
    // await SavePremierBetLeaguesWithFixturesService.syncLeaguesAndFixtures();
    //MegaPari
    // await FetchMegaPariLeagueService.init();
    // await FetchMegaPariLeagueService.syncLeagues();
    // await fetchMegaPariFixturesService.initialize();
    // await fetchMegaPariFixturesService.syncFixtures();
    // await fetchMegaPariFixturesWithOddsService.initialize();
    // await fetchMegaPariFixturesWithOddsService.syncFixtures(true, true);
    // await SaveMegaPariLeaguesWithFixturesService.syncLeaguesAndFixtures();
    // await AddMegaPariOddService.initialize();
    // await AddMegaPariOddService.syncOdds();
    // ✅ Open Website with Proxy (Puppeteer)
    // await openWebsiteWithProxy();
    //YellowBet
    // await FetchYellowBetLeagueService.init();
    // await FetchYellowBetLeagueService.syncLeagues();
    // await FetchYellowBetFixturesWithOddsService.initialize();
    // await FetchYellowBetFixturesWithOddsService.syncFixtures();
    //Betclic
    // await FetchBetclicLeaguesService.init();
    // await FetchBetclicLeaguesService.syncLeagues();
    // await FetchBetclicFixturesService.init();
    // await FetchBetclicFixturesService.syncFixtures();
    // await AddBetclicOddService.init();
    // await AddBetclicOddService.syncOdds();
    // await SaveBetclicLeaguesWithFixturesService.syncLeaguesAndFixtures();
    //1WIN
    // await Fetch1WinLeaguesWithFixturesService.init();
    // await Fetch1WinLeaguesWithFixturesService.syncLeaguesAndFixtures();
    // await Add1WinOddService.init();
    // await Add1WinOddService.syncOdds();
    // await Save1WinLeaguesWithFixturesService.syncLeaguesAndFixtures();
    //Bet223
    // await Bet22333ScraperService.scrape();
    //BETMOMO
    // await BetMomoScraperService.scrape();
    //ONEBET
    // await FetchOnebetLeaguesService.init();
    // await FetchOnebetLeaguesService.syncLeagues();
    // await FetchOnebetFixturesService.init();
    // await FetchOnebetFixturesService.syncFixtures();
    // await FetchOnebetOddsService.init();
    // await FetchOnebetOddsService.syncOdds();
    // await SaveOneBetLeaguesWithFixturesService.syncLeaguesAndFixtures();
    //22BET
    // await Fetch22betLeaguesService.init();
    // await Fetch22betLeaguesService.syncLeagues();
    // await Fetch22betFixturesWithOddsService.initialize();
    // await Fetch22betFixturesWithOddsService.syncFixtures();
    // await Save22BetLeaguesWithFixturesService.syncLeaguesAndFixtures();
    //SUNUBET
    // await FetchSunubetLeaguesService.init();
    // await FetchSunubetLeaguesService.syncLeagues();
    // await FetchSunubetFixturesService.init();
    // await FetchSunubetFixturesService.syncFixtures();
    // await FetchSunubetOddService.init();
    // await FetchSunubetOddService.syncOdds();
    // await SaveSunubetLeaguesWithFixturesService.syncLeaguesAndFixtures();
    //SUPERGOOAL
    // await GetAccessTokenService.getAccessToken()
    // await FetchSuperGoalLeaguesService.init();
    // await FetchSuperGoalLeaguesService.syncLeagues();
    // await FetchSuperGoalFixturesService.init();
    // await FetchSuperGoalFixturesService.syncFixtures();
    // await FetchSuperGoalOddService.init();
    // await FetchSuperGoalOddService.syncOdds();

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

    await fetchGuineeGamesFixturesWithOddsService.initialize();
    await fetchGuineeGamesFixturesWithOddsService.syncFixtures();


    // AkwaBet
    // await fetchAkwaBetLeagueService.init();
    // await fetchAkwaBetLeagueService.syncLeagues();
    //
    // await fetchAkwaBetFixturesWithOddsService.initialize();
    // await fetchAkwaBetFixturesWithOddsService.syncFixtures();

    // BetPawa
    // await fetchBetPawaLeagueService.init();
    // await fetchBetPawaLeagueService.syncLeagues();
    //
    // await fetchBetPawaFixturesWithOddsService.initialize();
    // await fetchBetPawaFixturesWithOddsService.syncFixtures();
};

processData().catch((error) => {
    console.error("Error running FetchGroupService processData:", error);
});

export default app;