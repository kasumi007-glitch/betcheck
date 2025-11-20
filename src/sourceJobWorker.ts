// sourceJobWorker.ts
import dotenv from "dotenv";
import cron from "node-cron";
import SaveBetsOddsService from "./services/SaveBetsOddsService";
import Save1WinLeaguesWithFixturesService from "./services/1win/Save1WinLeaguesWithFixturesService";
import Save1xBetLeaguesWithFixturesService from "./services/1xbet/Save1xBetLeaguesWithFixturesService";
import Save22BetLeaguesWithFixturesService from "./services/22bet/Save22BetLeaguesWithFixturesService";
import SaveBetMomoLeaguesWithFixturesService from "./services/bet-momo/SaveBetMomoLeaguesWithFixturesService";
import SaveBet223LeaguesWithFixturesService from "./services/bet223/SaveBet223LeaguesWithFixturesService";
// import SaveBetclicLeaguesWithFixturesService from "./services/betclic/SaveBetclicLeaguesWithFixturesService";
import SaveMegaPariLeaguesWithFixturesService from "./services/mega-pari/SaveMegaPariLeaguesWithFixturesService";
import SavePremierBetLeaguesWithFixturesService from "./services/premierbet/SavePremierBetLeaguesWithFixturesService";
import SaveSunubetLeaguesWithFixturesService from "./services/sunu-bet/SaveSunubetLeaguesWithFixturesService";
import SaveSuperGoalLeaguesWithFixturesService from "./services/super-goal/SaveSuperGoalLeaguesWithFixturesService";
import SaveYellowBetLeaguesWithFixturesService from "./services/yellowbet/SaveYellowBetLeaguesWithFixturesService";
import saveAkwaBetLeaguesWithFixturesService from "./services/akwabet/SaveAkwaBetLeaguesWithFixturesService";
import saveBetPawaLeaguesWithFixturesService from "./services/betpawa/SaveBetPawaLeaguesWithFixturesService";
import saveGeniusBetLeaguesWithFixturesService from "./services/geniusbet/SaveGeniusBetLeaguesWithFixturesService";
import saveGuineeGamesLeaguesWithFixturesService from "./services/guinee-games/SaveGuineeGamesLeaguesWithFixturesService";
import saveLineBetLeaguesWithFixturesService from "./services/linebet/SaveLineBetLeaguesWithFixturesService";
import saveMelBetLeaguesWithFixturesService from "./services/melbet/SaveMelBetLeaguesWithFixturesService";
import saveParipesaLeaguesWithFixturesService from "./services/paripesa/SaveParipesaLeaguesWithFixturesService";
import Save888BetsLeaguesWithFixturesService from "./services/ao/888Bet/Save888BetsLeaguesWithFixturesService";
import SaveEBetLeaguesWithFixturesService from "./services/ao/ebet/SaveEBetLeaguesWithFixturesService";
import SaveApolloGamesLeaguesWithFixturesService from "./services/cg/apollogames/SaveApolloGamesLeaguesWithFixturesService";
import SaveEliteBetLeaguesWithFixturesService from "./services/cg/elitebet/SaveEliteBetLeaguesWithFixturesService";
import SavePlayongoLeaguesWithFixturesService from "./services/cg/playongo/SavePlayongoLeaguesWithFixturesService";
import SaveBWinnersLeaguesWithFixturesService from "./services/sl/bwinners/SaveBWinnersLeaguesWithFixturesService";
import SaveMWosLeaguesWithFixturesService from "./services/zw/mwos/SaveMWosLeaguesWithFixturesService";
import SaveCmBettomaxLeaguesWithFixturesService from "./services/cm/bettomax/SaveCmBettomaxLeaguesWithFixturesService";
import SaveBettomaxLeaguesWithFixturesService from "./services/sl/bettomax/SaveBettomaxLeaguesWithFixturesService";
import SaveAllPremierBetLeaguesWithFixturesService from "./services/ao/ao-premierbet/SaveAllPremierBetLeaguesWithFixturesService";
import SaveBetmomoLeaguesWithFixturesService from "./services/betmomo/SaveBetmomoLeaguesWithFixturesService";
import SaveCiBetclicLeaguesWithFixturesService from "./services/ci/betclic/SaveCiBetclicLeaguesWithFixturesService";
import Save1WinProLeaguesWithFixturesService from "./services/1win-pro/Save1WinProLeaguesWithFixturesService";
import SaveCdBetwinnerLeaguesWithFixturesService from "./services/cd/betwinner1/SaveCdBetwinnerLeaguesWithFixturesService";
import SaveCdBetikaLeaguesWithFixturesService from "./services/cd/betika/SaveCdBetikaLeaguesWithFixturesService";
import SaveCdMojabetLeaguesWithFixturesService from "./services/cd/mojabet/SaveCdMojabetLeaguesWithFixturesService";
import SaveCdWinnerBetLeaguesWithFixturesService from "./services/cd/winner-bet/SaveCdWinnerBetLeaguesWithFixturesService";
import SaveSnMojabetLeaguesWithFixturesService from "./services/sn/mojabet/SaveSnMojabetLeaguesWithFixturesService";

dotenv.config();
const SYNC_FIXTURES_CRON = process.env.SYNC_FIXTURES_CRON ?? "0 0 * * *"; // Default: every day at midnight


const runSourceJobSync = async () => {
    console.log(
        `⏳ Running save get sources... at ${new Date().toLocaleTimeString()}...`
    );

    const results = await Promise.allSettled([
        // Save1WinLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        Save1xBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        Save22BetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        saveAkwaBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        // SaveBetMomoLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveBetmomoLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveBet223LeaguesWithFixturesService.syncLeaguesAndFixtures(),
        // SaveBetclicLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        saveBetPawaLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        saveGeniusBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        saveGuineeGamesLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        saveLineBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveMegaPariLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        saveMelBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        saveParipesaLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        new SavePremierBetLeaguesWithFixturesService().syncLeaguesAndFixtures("ML_PREMIERBET"),
        // new SavePremierBetLeaguesWithFixturesService().syncLeaguesAndFixtures("TG_PREMIERBET"),
        SaveSunubetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveSuperGoalLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveYellowBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //AO Sources
        Save888BetsLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveEBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveAllPremierBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //CG Sources
        SaveApolloGamesLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveEliteBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SavePlayongoLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        Save1WinProLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //CM Sources
        SaveCmBettomaxLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //SL Sources
        SaveBWinnersLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveBettomaxLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //ZW Sources
        SaveMWosLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //CI
        SaveCiBetclicLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //CD
        SaveCdBetwinnerLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveCdBetikaLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveCdMojabetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
        SaveCdWinnerBetLeaguesWithFixturesService.syncLeaguesAndFixtures(),

        //SN
        SaveSnMojabetLeaguesWithFixturesService.syncLeaguesAndFixtures(),
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
    cron.schedule(SYNC_FIXTURES_CRON, async () => {
        console.log("📅 Scheduled source save started...");
        await runSourceJobSync();
    });
};

(async () => {
    console.log("🔧 Source Job Worker started...");

    const triggerImmediately = process.env.SOURCE_JOB_RUN_IMMEDIATELY === "true";

    try {
        // Always start cron
        await runScheduleSync();

        if (triggerImmediately) {
            console.log("🚀 SOURCE_JOB_RUN_IMMEDIATELY=true → Running job immediately...");
            await runSourceJobSync();
            console.log("✅ Immediate Source Job completed.");
        }

        // Keep process alive
        console.log("🕒 Waiting for scheduled jobs...");
    } catch (error) {
        console.error("❌ Source Job Worker failed:", error);
        process.exit(1);
    }
})();

