import { Console } from "console";
import { fetchFromApiWithoutProxy } from "../../utils/ApiClientMultiTry";
import fs from "fs";

class Save1xBetLeaguesWithFixturesService {
  private readonly apiUrl =
    "https://1xbet.com/LineFeed/GetSportsShortZip?sports=1&lng=en&virtualSports=true&gr=824&groupChamps=true";
  private readonly fixturesApiUrlTemplate =
    "https://1xbet.com/LineFeed/Get1x2_VZip?sports=1&champs={sourceLeagueId}&count=20&lng=en&mode=4&getEmpty=true&virtualSports=true&countryFirst=true";

  async syncLeaguesAndFixtures() {
    console.log("🚀 Fetching 1xBet leagues...");
    const response = await fetchFromApiWithoutProxy(this.apiUrl);
    if (!response?.Value?.length) {
      console.warn("⚠️ No leagues found in 1xBet API response.");
      return;
    }

    const jsonData: any = { countries: {} };
    const sport = response.Value.find((s: any) => s.I === 1 && s.L);

    if (sport?.L?.length) {
      for (const leagueOrCountry of sport.L) {
        console.log("🏟️ Processing league/country:", leagueOrCountry.L);
        // if (leagueOrCountry.L !== "Cyprus. First Division") continue;
        if (leagueOrCountry.SC?.length) {
          // 🏙️ It's a country with sub-leagues
          for (const league of leagueOrCountry.SC) {
            await this.processLeague(leagueOrCountry.L, league, jsonData);
          }
        } else {
          // 🏟️ It's a direct league (not grouped under country)
          await this.processLeague("World", leagueOrCountry, jsonData);
        }
      }
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );
    // 🗓️ Add today's date
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

    // 📝 Save into /src/files/ folder
    const filePath = `./files/common/1xbet_countries_leagues_fixtures_${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ JSON file generated: ${filePath}`);
  }

  private async processLeague(missingCountryName: string, league: any, jsonData: any) {
    const leagueId = league.LI;
    const leagueNameRaw = league.L;

    if (!leagueNameRaw || !leagueId) return;


    let [countryName, leagueName] = leagueNameRaw.split(".").map((s: string) => s.trim());

    // let countryName = leagueNameRaw.split(".")[0].trim();

    // let leagueName = leagueNameRaw.split(".")[1]?.trim() || leagueNameRaw;
    if (!leagueNameRaw.includes(".")) {
      leagueName = leagueNameRaw;
      countryName = missingCountryName;
    }

    if (!jsonData.countries[countryName]) {
      jsonData.countries[countryName] = { leagues: {} };
    }

    jsonData.countries[countryName].leagues[leagueId] = {
      name: leagueName,
      fixtures: [],
    };

    await this.fetchAndAttachFixtures(leagueId, jsonData, countryName);
  }

  private async processLeagueNoneCountry(countryName: string, league: any, jsonData: any) {
    const leagueId = league.LI;
    const leagueName = league.L;

    if (!leagueName || !leagueId) return;

    if (!jsonData.countries[countryName]) {
      jsonData.countries[countryName] = { leagues: {} };
    }

    jsonData.countries[countryName].leagues[leagueId] = {
      name: leagueName,
      fixtures: [],
    };

    await this.fetchAndAttachFixtures(leagueId, jsonData, countryName);
  }

  private async fetchAndAttachFixtures(leagueId: number, jsonData: any, countryName: string) {
    const url = this.fixturesApiUrlTemplate.replace("{sourceLeagueId}", String(leagueId));
    const response = await fetchFromApiWithoutProxy(url);
    if (!response?.Value?.length) return;

    for (const fixture of response.Value) {
      const homeTeam = fixture.O1?.trim();
      const awayTeam = fixture.O2?.trim();

      if (
        homeTeam &&
        awayTeam &&
        jsonData.countries[countryName].leagues[leagueId]
      ) {
        const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
        if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
        if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
      }
    }
  }
}

export default new Save1xBetLeaguesWithFixturesService();
