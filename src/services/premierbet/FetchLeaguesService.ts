import { db } from "../../infrastructure/database/Database";
// import { httpClientFromApi } from "../../utils/HttpClientML";
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

class FetchLeaguesService {
  private sourceId!: number;
  private httpClient!: (url: string) => Promise<any>;
  private apiUrlTemplate!: string;
  private countryNameMappings: Record<string, string> = {};
  private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

  async init(sourceName: string) {
    switch (sourceName.toUpperCase()) {
      // case "PREMIERBET":
      //   this.apiUrlTemplate =
      //     "https://sports-api.premierbet.com/ci/v1/competitions?country=CI&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
      //   this.httpClient = httpClientCI;
      //   break;

      case "ML_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/ml/v1/competitions?country=ML&group=g7&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientML;
        break;

      case "SN_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/sn/v1/competitions?country=SN&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientSN;
        break;

      case "CM_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/cm/v1/competitions?country=CM&group=g1&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientCM;
        break;

      case "GA_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/ga/v1/competitions?country=GA&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = fetchFromApiWithoutProxyGA;
        break;

      case "TG_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/tg/v2/competitions?country=TG&group=g3&platform=desktop&locale=en&timeOffset=-180&sportId=SOCCER";
        this.httpClient = httpClientTG;
        break;

      case "CG_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/cg/v1/competitions?country=CG&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientCG;
        break;

      case "CD_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/cd/v1/competitions?country=CD&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientCD;
        break;

      case "SL_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.mercurybet.com/v1/competitions?country=SL&group=g5&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientSL;
        break;

      case "AO_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/ao/v1/competitions?country=AO&group=g2&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientAO;
        break;

      case "ZW_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/zw/v1/competitions?country=ZW&group=g4&platform=desktop&locale=en&timeOffset=-180&sportId=1";
        this.httpClient = httpClientZW;
        break;

      default:
        throw new Error(`Unknown source: ${sourceName}`);
    }

    const source = await db("sources").where("name", sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    await this.loadCountryNameMappings();
    await this.loadLeagueNameMappings();
  }

  async syncLeagues(sourceName: string) {
    await this.init(sourceName);
    console.log("🚀 Fetching leagues data...");
    const response = await this.httpClient(this.apiUrlTemplate);

    if (!response?.categories.length) {
      console.warn("⚠️ No data received from API.");
      return;
    }

    for (const category of response.categories) {
      const sourceCountryName = category.name;
      console.log(`🔍 Processing leagues for country: ${sourceCountryName}`);
      if (!sourceCountryName) {
        console.warn("⚠️ No country name found in category.");
        continue;
      }

      const countryName = this.countryNameMappings[sourceCountryName?.trim()] ?? sourceCountryName?.trim();
      const dbCountry = await db("countries")
        .where("name", countryName)
        .andWhere("is_active", true)
        .first();

      if (!dbCountry) {
        console.warn(
          `⚠️ Skipping country '${sourceCountryName}' because no active country.`
        );
        continue;
      }

      // if (dbCountry.name !== 'England') continue;

      for (const competition of category.competitions) {
        await this.processCompetition(dbCountry, category, competition);
      }
    }

    console.log("✅ Leagues data synced successfully!");
  }

  private async processCompetition(dbCountry: any, category: any, competition: any) {
    const { id: sourceLeagueId, name: sourceLeagueName } = competition;
    const sourceCountryName = category.name;

    // // Apply name mappings if available
    // const mappedLeagueName =
    //   leagueNameMappings[sourceLeagueName] || sourceLeagueName;

    // const country = await db("countries")
    //   .where("name", sourceCountryName)
    //   .andWhere("is_active", true)
    //   .first();

    // if (!country) {
    //   console.warn(`⚠️ No match found for country: ${sourceCountryName}`);
    //   return;
    // }


    // Get all league mappings for this specific country
    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    // Find the mapped league name if available
    const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
    const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

    const league = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .first();

    if (league) {
      console.log(
        `✅ Matched league: ${mappedLeagueName} in ${sourceCountryName}`
      );

      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: sourceCountryName,
          league_id: league.id,
          country_code: dbCountry.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id", "source_league_id"])
        .ignore() // This prevents duplicate inserts
        .returning("*"); // Returns the inserted row(s) if successful

      // Check if insert was successful or ignored
      if (result.length > 0) {
        console.log(
          `✅ Inserted new league: ${sourceLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      } else {
        console.warn(
          `⚠️ Ignored duplicate league: ${sourceLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
        );
      }
    } else {
      console.warn(
        `⚠️ No match found for league: ${sourceLeagueName} in ${sourceCountryName}`
      );
    }
  }

  private async loadCountryNameMappings() {
    console.log("🔄 Loading country name mappings...");
    const mappings = await db("country_name_mappings").select("name", "mapped_name");
    this.countryNameMappings = mappings.reduce((acc, mapping) => {
      acc[mapping.mapped_name] = mapping.name;
      return acc;
    }, {} as Record<string, string>);
    console.log("✅ Country name mappings loaded.");
  }

  private async loadLeagueNameMappings() {
    console.log("🔄 Loading filtered league name mappings by country...");

    const mappings = await db("league_name_mappings as lm")
      .join("leagues as l", "lm.league_id", "=", "l.external_id")
      .join("countries as c", "l.country_code", "=", "c.code")
      .where("c.is_active", true) // Ensure country is active
      .select("lm.name", "lm.mapped_name", "l.country_code");

    // Group league mappings by country and store as an array
    this.leagueNameMappings = mappings.reduce((acc, mapping) => {
      if (!acc[mapping.country_code]) {
        acc[mapping.country_code] = []; // Initialize an empty array for each country
      }
      acc[mapping.country_code].push({
        name: mapping.name,
        mapped_name: mapping.mapped_name
      });
      return acc;
    }, {} as Record<string, { name: string; mapped_name: string }[]>);

    console.log("✅ Filtered league name mappings categorized by country loaded.");
  }
}

export default FetchLeaguesService;
