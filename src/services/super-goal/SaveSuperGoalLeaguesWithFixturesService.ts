import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClientCM";
import fs from "fs";
import puppeteer from "puppeteer";

class SaveSuperGoalLeaguesWithFixturesService {
  private readonly websiteUrl = "https://supergooal.cm/en/betting/football";
  private readonly fixturesApiUrlTemplate =
    "https://online.meridianbet.com/betshop/api/v1/standard/sport/58/league?page=0&time=ONE_DAY&leagues={leagueId}";
  private readonly sourceName = "SUPERGOOAL";

  async syncLeaguesAndFixtures() {
    console.log("🚀 Fetching SuperGoal leagues...");
    const { sidebarData, token } = await this.fetchSidebarJsonFromWebsite();
    // const token = await GetAccessTokenService.getAccessToken();

    if (!sidebarData?.payload?.sports?.length) {
      console.error("❌ No league data found in sidebar JSON!");
      return;
    }

    const payload = sidebarData.payload.sports.find((sport: any) => sport.name === "Football");

    let jsonData: any = { countries: {} };
    for (const region of payload.regions) {
      await this.processCountry(region, jsonData, token.access_token);
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    // 🗓️ Add today's date
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

    // 📝 Save into /src/files/ folder
    const filePath = `./files/common/supergoal_countries_leagues_fixtures_${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ JSON file generated: ${filePath}`);
  }

  private async processCountry(region: any, jsonData: any, token: string) {
    console.log(`🌍 Processing country: ${region.name}`);
    jsonData.countries[region.name] = { leagues: {} };

    for (const league of region.leagues) {
      await this.processLeague(league, jsonData, region.name, token);
    }
  }

  private async processLeague(league: any, jsonData: any, countryName: string, token: string) {
    const leagueId = league.leagueId;
    const leagueName = league.name;
    console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

    jsonData.countries[countryName].leagues[leagueId] = {
      name: leagueName,
      fixtures: [],
    };
    await this.fetchAndProcessFixtures(leagueId, jsonData, countryName, token);
  }

  private async fetchAndProcessFixtures(
    leagueId: number,
    jsonData: any,
    countryName: string,
    token: string
  ) {
    // const token = await GetAccessTokenService.getAccessToken();
    const fixturesUrl = this.fixturesApiUrlTemplate.replace(
      "{leagueId}",
      String(leagueId)
    );
    const response = await httpClientFromApi(fixturesUrl, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en",
        authorization: `Bearer ${token}`, // Replace with your token
      },
    });
    if (!response?.payload?.leagues?.length) return;

    for (const event of response.payload.leagues[0].events) {
      this.processMatch(event, leagueId, jsonData, countryName);
    }
  }

  private processMatch(
    event: any,
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const homeTeam = event.header.rivals[0].trim();
    const awayTeam = event.header.rivals[1].trim();

    if (
      homeTeam &&
      awayTeam &&
      jsonData.countries[countryName].leagues[leagueId]
    ) {
      const fixtures =
        jsonData.countries[countryName].leagues[leagueId].fixtures;
      if (!fixtures.includes(homeTeam)) {
        fixtures.push(homeTeam);
      }
      if (!fixtures.includes(awayTeam)) {
        fixtures.push(awayTeam);
      }
    }
  }

  private async fetchSidebarJsonFromWebsite(): Promise<any | null> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.goto(this.websiteUrl, { waitUntil: "networkidle2" });

      // Wait for the script tag to be loaded
      await page.waitForSelector("#ng-state", { timeout: 10000 });

      const ngStateContent = await page.$eval("#ng-state", el => el.textContent || "");

      const ngStateJson = JSON.parse(ngStateContent);

      if (!ngStateJson.sidebar || !ngStateJson.NEW_TOKEN) {
        console.warn("⚠️ Sidebar or NEW_TOKEN not found in ng-state.");
        return null;
      }

      const sidebarData = JSON.parse(ngStateJson.sidebar);
      const token = JSON.parse(ngStateJson.NEW_TOKEN);

      return { sidebarData, token };
    } catch (error) {
      console.error("❌ Failed to extract sidebar using Puppeteer:", error);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

export default new SaveSuperGoalLeaguesWithFixturesService();
