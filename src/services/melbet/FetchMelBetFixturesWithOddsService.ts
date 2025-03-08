import { db } from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import MarketType from "../../models/MarketType";
import { fetchFromApi } from "../../utils/ApiClient";
import { MarketObj } from "../interfaces/MarketObj";
import { teamNameMappings } from "../teamNameMappings";

//for count get it from leagues "GC": 20, but must be multiple of 10
class FetchMelBetFixturesWithOddsService {
  private readonly apiUrlTemplate =
      "https://melbet.com/service-api/LineFeed/Get1x2_VZip?sports=1&champs={sourceLeagueId}&count=40&lng=en&mode=4&country=214&partner=8&getEmpty=true&virtualSports=true";
  private readonly sourceName = "MelBet";
  private sourceId!: number;

  // 1) Market ID → Market Name
  private readonly marketMapping: Record<number, string> = {
    1: "1X2",
    17: "Over / Under",
    19: "Both Teams to Score",
  };

  // 2) Market Name → Group Name
  private readonly marketGroupMapping: Record<string, string> = {
    "1X2": "Main",
    "Over / Under": "Main",
    "Both Teams to Score": "Main",
  };

  // 3) Outcome Name Mapping
  private readonly outcomeNameNewMapping: Record<number, string> = {
    1: "1",
    2: "X",
    3: "2",
    9: "Over",
    10: "Under",
    180: "Yes",
    181: "No",
  };

  private dbMarkets: Market[] = [];
  private dbMarketTypes: MarketType[] = [];

  async initialize() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
          .insert({ name: this.sourceName })
          .returning("id");
    } else {
      this.sourceId = source.id;
    }

    this.dbMarkets = await this.getMarkets();
    this.dbMarketTypes = await this.getMarketTypes();
  }

  async syncFixtures() {
    console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

    // Fetch active leagues linked to MelBet
    const leagues = await db("source_league_matches")
        .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
        .select(
            "source_league_matches.source_league_id",
            "leagues.external_id as league_id"
        )
        .where("source_league_matches.source_id", this.sourceId)
        .andWhere("leagues.is_active", true);

    for (const league of leagues) {
      await this.fetchAndProcessFixtures(
          league.source_league_id,
          league.league_id
      );
    }

    console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
  }

  private async fetchAndProcessFixtures(
      sourceLeagueId: string,
      leagueId: number
  ) {
    const apiUrl = this.apiUrlTemplate.replace(
        "{sourceLeagueId}",
        sourceLeagueId
    );
    const response = await fetchFromApi(apiUrl);

    if (!response?.Value?.length) {
      console.warn(`⚠️ No fixtures received for league ID: ${sourceLeagueId}`);
      return;
    }

    for (const fixture of response.Value) {
      const isFixtureProcessed = await this.processFixture(
          fixture,
          leagueId,
          sourceLeagueId
      );

      if (isFixtureProcessed) {
        await this.fetchAndProcessOdds(fixture, leagueId, sourceLeagueId);
      } else {
        console.warn(
            `⚠️ Skipping odds fetch for fixture: ${fixture.I} due to failed processing.`
        );
      }
    }
  }

  private async processFixture(
      fixture: any,
      leagueId: number,
      sourceLeagueId: string
  ): Promise<boolean> {
    const {
      I: sourceFixtureId,
      O1: homeTeamRaw,
      O2: awayTeamRaw,
      S: startTime,
    } = fixture;
    console.log(fixture)
    const eventDate = new Date(startTime * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    if (eventDate < today) {
      console.log(`🗓️ Skipping past fixture: ${homeTeamRaw} vs ${awayTeamRaw}`);
      return false;
    }

    // **Apply Name Mapping for Home and Away Teams**
    const homeTeam = teamNameMappings[homeTeamRaw] || homeTeamRaw;
    const awayTeam = teamNameMappings[awayTeamRaw] || awayTeamRaw;

    // **Match fixture in database**
    let matchedFixture = await db("fixtures")
        .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
        .select(
            "fixtures.*",
            "leagues.name as league_name",
            "leagues.id as parent_league_id"
        )
        .whereRaw(
            `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
            [`%${homeTeam}%`, `%${awayTeam}%`]
        )
        .andWhere("fixtures.date", ">=", today)
        .andWhere("fixtures.league_id", leagueId)
        .first();

    if (!matchedFixture) {
      console.warn(
          `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${leagueId}`
      );
      return false;
    }

    // **Insert into source_matches**
    const result = await db("source_matches")
        .insert({
          source_fixture_id: sourceFixtureId,
          source_competition_id: sourceLeagueId,
          source_event_name: `${homeTeam} vs ${awayTeam}`,
          fixture_id: matchedFixture.id,
          competition_id: matchedFixture.parent_league_id,
          source_id: this.sourceId,
        })
        .onConflict(["fixture_id", "source_id"])
        .ignore()
        .returning("*");

    if (result.length > 0) {
      console.log(
          `✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
      );
    } else {
      console.warn(
          `⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
      );
    }

    return true;
  }

  private async fetchAndProcessOdds(
      fixtureData: any,
      leagueId: number,
      sourceLeagueId: string
  ) {
    const { I: sourceFixtureId } = fixtureData;

    const fixture = await db("source_matches")
        .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
        .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
        .select(
            "source_matches.source_fixture_id",
            "fixtures.id",
            "fixtures.date"
        )
        .where("source_matches.source_id", this.sourceId)
        .andWhere("source_matches.source_competition_id", sourceLeagueId)
        .andWhere("source_matches.source_fixture_id", sourceFixtureId)
        .andWhere("fixtures.date", ">=", new Date())
        .andWhere("leagues.is_active", true)
        .andWhere("leagues.external_id", leagueId)
        .first();

    if (!fixtureData) {
      console.warn(`❌ No Fixture found!`);
      return;
    }

    // Typically the markets are in data.Value.E
    if (!fixtureData?.E?.length) {
      console.warn(`❌ No 'E' array for fixture: ${sourceFixtureId}`);
      return;
    }

    // Process each "marketObj" in E
    const filteredData = fixtureData.E.filter((match: MarketObj) =>
        Object.keys(this.marketMapping).includes(String(match.G))
    );

    for (const marketObj of filteredData) {
      // G => the market ID
      const marketId = marketObj.G; // e.g. 7 => "Correct Score"

      // 1) Map G => Market Name
      const marketName = this.marketMapping[marketId];

      // find market
      const dbMarket = this.dbMarkets.find(
          (market) => market.name === marketName
      );
      if (!dbMarket) {
        console.warn(`❌ No 'Market Found' : ${marketName}`);
        continue;
      }

      // T => the outcome ID we want to map
      const outcomeId = marketObj.T; // e.g. 221

      const outcome = this.outcomeNameNewMapping[outcomeId];

      const dbMarketType = this.dbMarketTypes.find(
          (marketType) =>
              marketType.name === outcome && marketType.market_id === dbMarket.id
      );
      if (!dbMarketType) {
        console.warn(`❌ No 'Market Type Found' : ${marketName}`);
        continue;
      }

      // If there's a single coefficient .C, store as an outcome
      await this.saveMarketOutcome(
          dbMarketType.id,
          Number(marketObj.C),
          dbMarket.id,
          fixture.id,
          sourceFixtureId
      );

      // If you also have multiple "outcomes" in marketObj.ME or marketObj.outcomes, you’d loop them similarly
    }
  }

  private async getMarkets(): Promise<Market[]> {
    let row: Market[] = await db("markets");
    return row;
  }

  private async getMarketTypes(): Promise<MarketType[]> {
    let row: MarketType[] = await db("market_types");
    return row;
  }

  private async saveMarketOutcome(
      marketTypeId: number,
      coefficient: number,
      marketId: number,
      fixtureId: number,
      externalSourceFixtureId: string
  ) {
    await db("odds")
        .insert({
          market_id: marketId,
          market_type_id: marketTypeId,
          coefficient,
          fixture_id: fixtureId,
          external_source_fixture_id: externalSourceFixtureId,
          source_id: this.sourceId,
        })
        .onConflict([
          "market_id",
          "market_type_id",
          "fixture_id",
          "external_source_fixture_id",
          "source_id",
        ])
        .merge(["coefficient"]);

    console.log("Odds data inserted/updated successfully.");
  }
}

// Export and initialize
const fetchMelBetFixturesWithOddsService =
    new FetchMelBetFixturesWithOddsService();

export default fetchMelBetFixturesWithOddsService;
