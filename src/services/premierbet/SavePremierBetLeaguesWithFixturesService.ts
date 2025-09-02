
import { httpClientFromApi as httpClientCI } from "../../utils/HttpClientCI";
import { httpClientFromApi as httpClientML } from "../../utils/HttpClientML";
import { httpClientFromApi as httpClientSN } from "../../utils/HttpClientSN";
import { httpClientFromApi as httpClientCM } from "../../utils/HttpClientCM";
import { httpClientFromApi as httpClientGA, fetchFromApiWithoutProxy as fetchFromApiWithoutProxyGA } from "../../utils/HttpClientGA";
import { httpClientFromApi as httpClientTG } from "../../utils/HttpClientTG";
import { httpClientFromApi as httpClientCG } from "../../utils/HttpClientCG";
import { httpClientFromApi as httpClientCD } from "../../utils/HttpClientCD";
import { httpClientFromApi as httpClientSL } from "../../utils/HttpClientSL";
import { httpClientFromApi as httpClientAO } from "../../utils/HttpClientAO";
import { httpClientFromApi as httpClientZW } from "../../utils/HttpClientZW";
import fs from "fs";

class SavePremierBetLeaguesWithFixturesService {
  // private readonly leaguesApiUrl =
  //   "https://sports-api.premierbet.com/ci/v1/competitions?country=CI&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
  // private readonly fixturesApiUrl =
  //   "https://sports-api.premierbet.com/ci/v1/events?country=CI&group=g4&platform=desktop&locale=en&sportId=1&competitionId={competitionId}&isGroup=false";

  private httpClient!: (url: string) => Promise<any>;
  private leaguesApiUrl!: string;
  private fixturesApiUrl!: string;
  private countryCode!: string;

  async init(sourceName: string) {
    switch (sourceName.toUpperCase()) {
      // case "PREMIERBET":
      //   this.apiUrlTemplate =
      //     "https://sports-api.premierbet.com/ci/v1/competitions?country=CI&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.apiUrlTemplate =
      //     "https://sports-api.premierbet.com/ci/v1/events?country=CI&group=g4&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
      //   this.httpClient = httpClientCI;
      // this.countryCode = "ci";
      //   break;

      case "ML_PREMIERBET":
        this.leaguesApiUrl =
          "https://sports-api.premierbet.com/ml/v1/competitions?country=ML&group=g7&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.fixturesApiUrl =
          "https://sports-api.premierbet.com/ml/v1/events?country=ML&group=g7&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
        this.httpClient = httpClientML;
        this.countryCode = "common";
        break;

      // case "SN_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.premierbet.com/sn/v1/competitions?country=SN&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.premierbet.com/sn/v1/events?country=SN&group=g5&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
      //   this.httpClient = httpClientSN;
      //   this.countryCode = "sn";
      //   break;

      // case "CM_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.premierbet.com/cm/v1/competitions?country=CM&group=g1&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.premierbet.com/cm/v1/events?country=CM&group=g1&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
      //   this.httpClient = httpClientCM;
      //   this.countryCode = "cm";
      //   break;

      // case "GA_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.premierbet.com/ga/v1/competitions?country=GA&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.premierbet.com/ga/v1/events?country=GA&group=g4&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
      //   this.httpClient = fetchFromApiWithoutProxyGA;
      //   this.countryCode = "ga";
      //   break;

      case "TG_PREMIERBET":
        this.leaguesApiUrl =
          "https://sports-api.premierbet.com/tg/v2/competitions?country=TG&group=g3&platform=desktop&locale=en&timeOffset=-180&sportId=SOCCER";
        this.fixturesApiUrl =
          "https://sports-api.premierbet.com/tg/v2/events?country=TG&group=g3&platform=desktop&locale=en&sportId=SOCCER&competitionId={leagueId}&limit=10";
        this.httpClient = httpClientTG;
        this.countryCode = "tg";
        break;

      // case "CG_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.premierbet.com/cg/v1/competitions?country=CG&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.premierbet.com/cg/v1/events?country=CG&group=g5&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
      //   this.httpClient = httpClientCG;
      //   this.countryCode = "cg";
      //   break;

      // case "CD_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.premierbet.com/cd/v1/competitions?country=CD&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.premierbet.com/cd/v1/events?country=CD&group=g5&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
      //   this.httpClient = httpClientCD;
      //   this.countryCode = "cd";
      //   break;

      // case "SL_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.mercurybet.com/v1/competitions?country=SL&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.mercurybet.com/v1/events?country=SL&group=g5&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false&limit=10";
      //   this.httpClient = httpClientSL;
      //   this.countryCode = "sl";
      //   break;

      // case "AO_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.premierbet.com/ao/v1/competitions?country=AO&group=g2&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.premierbet.co.ao/v1/events?country=AO&group=g2&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false&limit=10";
      //   this.httpClient = httpClientAO;
      //   this.countryCode = "ao";
      //   break;

      // case "ZW_PREMIERBET":
      //   this.leaguesApiUrl =
      //     "https://sports-api.premierbet.com/zw/v1/competitions?country=ZW&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.fixturesApiUrl =
      //     "https://sports-api.premierbet.com/zw/v1/events?country=ZW&group=g4&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";
      //   this.httpClient = httpClientZW;
      //   this.countryCode = "zw";
      //   break;

      default:
        throw new Error(`Unknown source: ${sourceName}`);
    }
  }

  async syncLeaguesAndFixtures(sourceName: string) {
    await this.init(sourceName);
    console.log("🚀 Fetching PremierBet leagues...");
    const response = await this.httpClient(this.leaguesApiUrl);
    if (!response?.categories.length) {
      console.warn("⚠️ No leagues found in PremierBet API response.");
      return;
    }

    let jsonData: any = { countries: {} };

    for (const category of response.categories) {
      await this.processCountry(category, jsonData);
    }

    jsonData.countries = Object.fromEntries(
      Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
    );

    // 🗓️ Add today's date
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

    // 📝 Save into /src/files/ folder
    const filePath = `./files/${this.countryCode}_premierbet_countries_leagues_fixtures_${dateStr}.json`;
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    console.log(`✅ JSON file generated: ${filePath}`);
  }

  private async processCountry(category: any, jsonData: any) {
    const countryName = category.name;
    console.log(`🌍 Processing country: ${countryName}`);
    jsonData.countries[countryName] = { leagues: {} };

    for (const competition of category.competitions) {
      await this.processLeague(competition, jsonData, countryName);
    }
  }

  private async processLeague(
    competition: any,
    jsonData: any,
    countryName: string
  ) {
    const leagueId = competition.id;
    const leagueName = competition.name;
    console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

    jsonData.countries[countryName].leagues[leagueId] = {
      name: leagueName,
      fixtures: [],
    };
    await this.fetchAndProcessFixtures(leagueId, jsonData, countryName);
  }

  private async fetchAndProcessFixtures(
    competitionId: number,
    jsonData: any,
    countryName: string
  ) {
    const fixturesUrl = this.fixturesApiUrl.replace(
      "{leagueId}",
      String(competitionId)
    );
    const response = await this.httpClient(fixturesUrl);
    if (!response?.data?.categories.length) return;

    for (const category of response.data.categories) {
      for (const competition of category.competitions) {
        for (const fixture of competition.events) {
          this.processMatch(fixture, competitionId, jsonData, countryName);
        }
      }
    }
  }

  private processMatch(
    match: any,
    leagueId: number,
    jsonData: any,
    countryName: string
  ) {
    const homeTeam = match.eventNames[0].trim();
    const awayTeam = match.eventNames[1].trim();

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
}

export default SavePremierBetLeaguesWithFixturesService;
