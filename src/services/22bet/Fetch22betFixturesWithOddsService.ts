// services/22bet/Fetch22betFixturesWithOddsService.ts
import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
import Group from "../../models/Group";
import Market from "../../models/Market";
// import { teamNameMappings } from "../teamNameMappings";

// Base API URL template for 22BET fixtures & odds.
// The placeholder {sourceLeagueId} will be replaced dynamically.
const API_URL_TEMPLATE =
  "https://platform.22bet.com.sn/api/event/list?status_in[]=0&limit=150&relations[]=odds&relations[]=competitors&leagueId_in[]={sourceLeagueId}&lang=en";

// Mapping from 22BET market IDs to internal market names.
const groupMapping: Record<number, string> = {
  621: "1X2",
  289: "Over / Under",
  589: "Both Teams to Score",
};

// Outcome mapping for each market.
// For example, in the 1X2 market, outcome IDs 1, 2, and 3 map to "1", "X", and "2" respectively.
const outcomeNameMapping: Record<number, Record<number, string>> = {
  621: { 1: "1", 2: "X", 3: "2" },
  289: { 12: "Over", 13: "Under" },
  589: { 74: "Yes", 76: "No" },
};

class Fetch22betFixturesWithOddsService {
  private readonly sourceName = "22BET";
  private sourceId!: number;
  private fetchFixture!: boolean;
  private fetchOdd!: boolean;

  private dbGroups: Group[] = [];
  private dbMarkets: Market[] = [];
  private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

  // Initialize the source and load markets/market types from the DB.
  async initialize() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    await this.loadTeamNameMappings();
    this.dbGroups = await this.getGroups();
    this.dbMarkets = await this.getMarkets();
  }

  // This method retrieves all source league matches for this source.
  // Each record provides a source_league_id (used to build the API URL)
  // and the corresponding internal league external_id.
  private async getSourceLeagues(): Promise<
    { source_league_id: string; league_external_id: number }[]
  > {
    return await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.external_id as league_external_id"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);
  }

  // Main method to sync fixtures and odds.
  async syncFixtures(fetchFixture: boolean, fetchOdd: boolean = false) {
    await this.initialize();
    this.fetchFixture = fetchFixture;
    this.fetchOdd = fetchOdd;
    console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

    // Retrieve all source league records for 22BET.
    const sourceLeagues = await this.getSourceLeagues();
    if (!sourceLeagues.length) {
      console.warn("⚠️ No source leagues found for 22BET.");
      return;
    }

    // Process fixtures for each source league.
    for (const league of sourceLeagues) {
      const apiUrl = API_URL_TEMPLATE.replace(
        "{sourceLeagueId}",
        league.source_league_id
      );
      console.log(
        `🔍 Fetching fixtures for source_league_id: ${league.source_league_id} (internal league: ${league.league_external_id})`
      );
      const response = await httpClientFromApi(apiUrl);
      if (!response?.data) {
        console.warn(
          `⚠️ No data received from API for source_league_id: ${league.source_league_id}`
        );
        continue;
      }
      const { items, relations } = response.data;
      if (!items || items.length === 0) {
        console.warn(
          `⚠️ No fixtures found in the API response for source_league_id: ${league.source_league_id}`
        );
        continue;
      }
      // Process each fixture
      for (const fixture of items) {
        if (this.fetchFixture) {
          await this.processFixture(
            fixture,
            league.league_external_id,
            relations
          );
        }
        if (this.fetchOdd) {
          await this.fetchAndProcessOdds(fixture, relations?.odds);
        }
      }
    }

    console.log(
      `✅ Fixtures and odds synced successfully from ${this.sourceName}!`
    );
  }

  // Process a single fixture: match it against internal DB fixtures and record in source_matches.
  private async processFixture(
    fixture: any,
    leagueExternalId: number,
    relations: any
  ): Promise<boolean> {
    // Assume fixture.id is the external fixture ID.
    const sourceFixtureId = fixture.id.toString();

    const leagueTeamMappings = this.teamNameMappings[leagueExternalId] || [];

    // Assuming fixture has properties competitor1Id and competitor2Id,
    // and the fixture also contains a relations object with a competitors array.
    const competitors = relations?.competitors || [];

    // Find the competitor objects based on the IDs.
    const homeCompetitor = competitors.find(
      (comp: any) => comp.id === fixture.competitor1Id
    );
    const awayCompetitor = competitors.find(
      (comp: any) => comp.id === fixture.competitor2Id
    );

    // Use the competitor names, or fallback to an empty string if not found.
    const homeTeamName = homeCompetitor?.name || "";
    const awayTeamName = awayCompetitor?.name || "";

    // Apply team name mappings only from this league
    const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
    const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

    // const homeTeam = teamNameMappings[homeTeamName] || homeTeamName;
    // const awayTeam = teamNameMappings[awayTeamName] || awayTeamName;

    // Convert fixture time (assumes fixture.time is a valid date/time string)
    const eventDate = new Date(fixture.time);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      console.log(`🗓️ Skipping past fixture: ${homeTeam} vs ${awayTeam}`);
      return false;
    }

    // Attempt to match this fixture with an internal fixture record.
    const matchedFixture = await db("fixtures")
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
      .andWhere("leagues.external_id", leagueExternalId)
      .first();

    if (!matchedFixture) {
      console.warn(
        `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${leagueExternalId}`
      );
      return false;
    }

    // Insert or ignore duplicate into source_matches.
    const result = await db("source_matches")
      .insert({
        source_fixture_id: sourceFixtureId,
        source_competition_id: leagueExternalId, // using league external ID here
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
        `⚠️ Duplicate match ignored: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
      );
    }

    return true;
  }

  private async fetchAndProcessOdds(
    fixture: any,
    oddsData: any
  ): Promise<void> {
    const sourceFixtureId = fixture.id.toString();
    const fixtureOdds = oddsData ? oddsData[sourceFixtureId] : null;
    if (!fixtureOdds?.length) {
      console.warn(`❌ No odds found for fixture: ${sourceFixtureId}`);
      return;
    }

    // Retrieve the corresponding source_match record to get the internal fixture ID.
    const sourceMatch = await db("source_matches")
      .where("source_fixture_id", sourceFixtureId)
      .andWhere("source_id", this.sourceId)
      .first();
    if (!sourceMatch) {
      console.warn(`❌ No source match found for fixture: ${sourceFixtureId}`);
      return;
    }
    const internalFixtureId = sourceMatch.fixture_id;

    // Process each market in the fixture odds.
    for (const marketObj of fixtureOdds) {
      await this.processMarketOdds(
        internalFixtureId,
        marketObj,
        sourceFixtureId
      );
    }
  }

  private async processMarketOdds(
    fixtureId: number,
    marketObj: any,
    sourceFixtureId: string
  ): Promise<void> {
    const groupId = marketObj.id;
    if (!Object.keys(groupMapping).includes(String(groupId))) {
      return; // Skip markets we don't process.
    }
    const groupName = groupMapping[groupId];
    const dbGroup = this.dbGroups.find(
      (m) => m.group_name.toLowerCase() === groupName.toLowerCase()
    );
    if (!dbGroup) {
      console.warn(`❌ No DB Group found for: ${groupName}`);
      return;
    }
    const outcomeMap = outcomeNameMapping[groupId];
    if (!outcomeMap) {
      console.warn(`❌ No outcome mapping defined for market: ${groupName}`);
      return;
    }

    for (const outcomeObj of marketObj.outcomes) {
      await this.processOutcome(
        fixtureId,
        outcomeObj,
        outcomeMap,
        dbGroup,
        groupName,
        sourceFixtureId,
        marketObj.specifiers
      );
    }
  }

  private async processOutcome(
    fixtureId: number,
    outcomeObj: any,
    outcomeMap: Record<number, string>,
    dbGroup: Group,
    marketName: string,
    sourceFixtureId: string,
    marketSpecifiers?: string
  ): Promise<void> {
    const outcomeId = outcomeObj.id;
    const outcomeName = outcomeMap[outcomeId];
    if (!outcomeName) {
      console.warn(
        `❌ No outcome mapping for market ${marketName} with outcome ID ${outcomeId}`
      );
      return;
    }
    const dbMarket = this.dbMarkets.find(
      (mt) =>
        mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
        mt.group_id === dbGroup.group_id
    );
    if (!dbMarket) {
      console.warn(
        `❌ No DB market found for market ${marketName} and outcome ${outcomeName}`
      );
      return;
    }

    // For Over/Under markets, override the odds coefficient using the specifiers.
    let coefficient = Number(outcomeObj.odds);
    if (marketName.toLowerCase() === "over / under" && marketSpecifiers) {
      const regex = /^total=2\.5$/;
      const match = regex.exec(marketSpecifiers);
      if (!match) {
        // coefficient = Number(match[1]);
        return;
      }
    }
    if (isNaN(coefficient)) return;

    await this.saveMarketOutcome(
      dbGroup.group_id,
      Number(outcomeObj.odds),
      dbMarket.market_id,
      fixtureId,
      sourceFixtureId
    );
  }

  private async getGroups(): Promise<Group[]> {
    return await db("groups");
  }

  private async getMarkets(): Promise<Market[]> {
    return await db("markets");
  }

  // Insert or update an odds record.
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
      .merge(["coefficient"]);

    console.log(
      `Odds for market_id ${marketId} saved/updated (coef: ${coefficient}).`
    );
  }

  private async loadTeamNameMappings() {
    console.log("🔄 Loading filtered team name mappings by league...");

    const mappings = await db("team_name_mappings as tm")
      .join("leagues as l", "tm.league_id", "=", "l.external_id")
      .where("l.is_active", true) // Ensure the league is active
      .select("tm.name", "tm.mapped_name", "l.external_id as league_id");

    // Group team mappings by league
    this.teamNameMappings = mappings.reduce((acc, mapping) => {
      if (!acc[mapping.league_id]) {
        acc[mapping.league_id] = []; // Initialize an array for each league
      }
      acc[mapping.league_id].push({
        name: mapping.name,
        mapped_name: mapping.mapped_name
      });
      return acc;
    }, {} as Record<number, { name: string; mapped_name: string }[]>);

    console.log("✅ Filtered team name mappings categorized by league loaded.");
  }

}

export default new Fetch22betFixturesWithOddsService();
