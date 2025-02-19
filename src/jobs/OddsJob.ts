import OddsService from "../services/OddsService";
// import cron from "node-cron";

// Function to fetch odds immediately
const fetchOddsNow = async () => {
    console.log("Fetching latest odds...");
    await OddsService.fetchAndStoreOdds();
    console.log("Odds update completed.");
};

// cron.schedule("*/30 * * * *", async () => {
//     console.log("Fetching latest odds...");
//     await OddsService.fetchAndStoreOdds();
//     console.log("Odds update completed.");
// });

// Call the function to fetch odds immediately
fetchOddsNow();

export default OddsService;