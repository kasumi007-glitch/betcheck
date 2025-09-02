import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { MarketObj } from "../interfaces/MarketObj";
import { httpClientFromApi as httpClientCI } from "../../utils/HttpClientCI";
import { httpClientFromApi as httpClientML } from "../../utils/HttpClientML";
import { httpClientFromApi as httpClientSN } from "../../utils/HttpClientSN";
import { httpClientFromApi as httpClientCM } from "../../utils/HttpClientCM";
import { httpClientFromApi as httpClientGA } from "../../utils/HttpClientGA";
import { httpClientFromApi as httpClientTG } from "../../utils/HttpClientTG";
import { httpClientFromApi as httpClientCG } from "../../utils/HttpClientCG";
import { httpClientFromApi as httpClientCD } from "../../utils/HttpClientCD";
import { httpClientFromApi as httpClientSL } from "../../utils/HttpClientSL";
import { httpClientFromApi as httpClientAO } from "../../utils/HttpClientAO";
import { httpClientFromApi as httpClientZW } from "../../utils/HttpClientZW";
import { OddsSnapshotService } from "../../utils/OddsSnapshotService";

class AddPremierBetOddService {
  // private readonly apiUrlTemplate =
  //   "https://sports-api.premierbet.com/ci/v1/events/{fixtureId}?country=CI&group=g4&platform=desktop&locale=en";

  private sourceId!: number;
  private httpClient!: (url: string) => Promise<any>;
  private apiUrlTemplate!: string;

  // 1) Market ID → Market Name
  private readonly groupMapping: Record<number, string> = {
    3: "1X2",
    29: "Over / Under",
    7: "Both Teams to Score",
  };

  private dbGroups: Group[] = [];
  private dbMarkets: Market[] = [];

  async init(sourceName: string) {
    switch (sourceName.toUpperCase()) {
      // case "PREMIERBET":
      //   this.apiUrlTemplate =
      //     "https://sports-api.premierbet.com/ci/v1/events/{fixtureId}?country=CI&group=g4&platform=desktop&locale=en";
      //   this.httpClient = httpClientCI;
      //   break;

      case "ML_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/ml/v1/events/{fixtureId}?country=ML&group=g7&platform=desktop&locale=en";
        this.httpClient = httpClientML;
        break;

      case "SN_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/sn/v1/events/{fixtureId}?country=SN&group=g5&platform=desktop&locale=en";
        this.httpClient = httpClientSN;
        break;

      case "CM_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/cm/v1/events/{fixtureId}?country=CM&group=g1&platform=desktop&locale=en";
        this.httpClient = httpClientCM;
        break;

      case "GA_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/ga/v1/events/{fixtureId}?country=GA&group=g4&platform=desktop&locale=en";
        this.httpClient = httpClientGA;
        break;

      case "TG_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/tg/v2/events/{fixtureId}?country=TG&group=g3&platform=desktop&locale=en";
        this.httpClient = httpClientTG;
        break;

      case "CG_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/cg/v1/events/{fixtureId}?country=CG&group=g5&platform=desktop&locale=en";
        this.httpClient = httpClientCG;
        break;

      case "CD_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/cd/v1/events/{fixtureId}?country=CD&group=g5&platform=desktop&locale=en";
        this.httpClient = httpClientCD;
        break;

      case "SL_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.mercurybet.com/v1/events/{fixtureId}?country=SL&group=g5&platform=desktop&locale=en";
        this.httpClient = httpClientSL;
        break;

      case "AO_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.co.ao/v1/events/{fixtureId}?country=AO&group=g2&platform=desktop&locale=en";
        this.httpClient = httpClientAO;
        break;

      case "ZW_PREMIERBET":
        this.apiUrlTemplate =
          "https://sports-api.premierbet.com/zw/v1/events/{fixtureId}?country=ZW&group=g4&platform=desktop&locale=en";
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

    this.dbGroups = await this.getGroups();
    this.dbMarkets = await this.getMarkets();
  }

  async syncOdds(sourceName: string) {
    await this.init(sourceName);
    console.log("🚀 Fetching odds data...");

    // Fetch all countries and leagues from the database
    // const countries = await db("countries").select("id", "name");
    // const leagues = await db("source_league_matches").select("source_league_id", "league_id", "source_country_name");

    // Fetch all fixtures with date >= current datetime
    const fixtures = await db("source_matches")
      .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select(
        "source_matches.source_fixture_id",
        "fixtures.id",
        "fixtures.date",
        "source_matches.competition_id"
      )
      .whereRaw("fixtures.date >= NOW()")
      .andWhere("source_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);
    // .andWhere("source_matches.source_competition_id", "1008226");

    for (const fixture of fixtures) {
      await this.fetchAndProcessOdds(fixture.id, fixture.source_fixture_id);
    }

    console.log("✅ Odds data synced successfully!");
  }

  private async fetchAndProcessOdds(
    fixtureId: number,
    sourceFixtureId: string
  ) {
    const apiUrl = this.apiUrlTemplate.replace("{fixtureId}", sourceFixtureId);

    const response = await this.httpClient(apiUrl);

    if (!response) {
      console.warn(`⚠️ No data received for fixture ID: ${sourceFixtureId}`);
      return;
    }

    await this.processEvent(fixtureId, sourceFixtureId, response);
  }

  private async processEvent(
    fixtureId: number,
    sourceFixtureId: string,
    event: any
  ) {
    const { marketGroups } = event;

    if (!marketGroups?.length) {
      return;
    }

    let marketGroup = marketGroups.find((group: any) => group.name === "Main");

    if (!marketGroup?.markets?.length) {
      return;
    }

    // Process each "marketObj" in E
    const filteredData = marketGroup.markets.filter((match: MarketObj) =>
      Object.keys(this.groupMapping).includes(String(match.id))
    );

    if (!filteredData?.length) {
      return;
    }

    for (const market of filteredData) {
      await this.processMarket(fixtureId, sourceFixtureId, market);
    }
  }

  private async processMarket(
    fixtureId: number,
    sourceFixtureId: string,
    market: any
  ) {
    // find market
    const dbGroup = this.dbGroups.find(
      (marketData) => marketData.group_name === market.name
    );

    if (!dbGroup) {
      console.warn(`❌ No 'Group Found' : ${market.name}`);
      return;
    }

    for (const outcome of market.outcomes) {
      if (
        (outcome.name === "Over" || outcome.name === "Under") &&
        outcome.handicap !== "2.5"
      ) {
        // Skip if the name is "Over" or "Under" and the handicap is not "2.5"
        continue;
      }

      const dbMarket = this.dbMarkets.find(
        (marketType) =>
          marketType.market_name === outcome.name &&
          marketType.group_id === dbGroup.group_id
      );

      if (!dbMarket) {
        console.warn(`❌ No 'Market Found' : ${outcome.name}`);
        continue;
      }

      await OddsSnapshotService.saveOrUpdate({
        group_id: dbGroup.group_id,
        market_id: dbMarket.market_id,
        fixture_id: fixtureId,
        source_id: this.sourceId,
        external_source_fixture_id: sourceFixtureId,
        coefficient: outcome.value,
      });

      // await this.saveMarketOutcome(
      //   dbGroup.group_id,
      //   outcome.value,
      //   dbMarket.market_id,
      //   fixtureId,
      //   sourceFixtureId
      // );
    }
  }

  private async getGroups(): Promise<Group[]> {
    return await db("groups");
  }

  private async getMarkets(): Promise<Market[]> {
    return await db("markets");
  }

  private async saveMarketOutcome(
    groupId: number,
    coefficient: number,
    marketId: number,
    fixtureId: number,
    externalSourceFixtureId: string
  ) {
    await db("fixture_odds")
      .insert({
        group_id: groupId,
        market_id: marketId,
        coefficient,
        fixture_id: fixtureId,
        external_source_fixture_id: externalSourceFixtureId,
        source_id: this.sourceId,
      })
      .onConflict([
        "group_id",
        "market_id",
        "fixture_id",
        "external_source_fixture_id",
        "source_id",
      ])
      .merge({
        coefficient: db.raw("EXCLUDED.coefficient"),
        updated_at: db.fn.now(),
      });

    console.log("Odds data inserted/updated successfully.");
  }
}

export default AddPremierBetOddService;
