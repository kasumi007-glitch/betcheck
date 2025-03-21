import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { fetchFromApi } from "../../utils/ApiClient";
import { teamNameMappings } from "../teamNameMappings";

// Interfaces for YellowBet API response structure
interface YellowBetOdd {
  n: string; // Outcome label from API (may be raw)
  p: string; // Price as string
  oc: number; // Outcome code (used for mapping)
  l?: string; // Optional line value (for Under/Over markets)
}

interface YellowBetBetType {
  id: number; // This will be used for marketMapping
  n: string; // Bet type name (e.g. "FT 1X2", etc.)
  odds: YellowBetOdd[];
}

interface YellowBetFixture {
  id: number; // Fixture ID from source
  gt: string; // Game time (ISO string)
  cn: string; // Country name
  lid: number; // Source league ID
  ln: string; // League name
  h: string; // Home team name
  a: string; // Away team name
  bts: YellowBetBetType[]; // Array of bet types for this fixture
  // Other fields omitted for brevity
}

interface YellowBetApiResponse {
  data: YellowBetFixture[];
  isSuccessfull: boolean;
}

class FetchYellowBetFixturesWithOddsService {
  // URL template with placeholder for the source league id
  private readonly apiUrlTemplate =
    "https://yellowbet.com.gn/services/evapi/event/GetEvents?betTypeIds=-1&take=100&statusId=0&eventTypeId=0&leagueIds={sourceLeagueId}";
  private readonly sourceName = "YELLOWBET";
  private sourceId!: number;
  private fetchFixture!: boolean;
  private fetchOdd!: boolean;
  private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

  // 1) Market ID → Market Name
  private readonly groupMapping: Record<string, string> = {
    "FT 1X2": "1X2",
    "Under/Over": "Over / Under",
    "GG/NG": "Both Teams to Score",
  };

  // 3) Outcome Name Mapping
  private readonly outcomeNameNewMapping: Record<string, string> = {
    "1": "1",
    X: "X",
    "2": "2",
    over: "Over",
    under: "Under",
    Yes: "Yes",
    No: "No",
  };

  private dbGroups: Group[] = [];
  private dbMarkets: Market[] = [];

  async initialize() {
    // Ensure the source exists
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
    // Load markets and market types from the database
    await this.loadTeamNameMappings();
    this.dbGroups = await this.getGroups();
    this.dbMarkets = await this.getMarkets();
  }

  async syncFixtures(fetchFixture: boolean, fetchOdd: boolean = false) {
    await this.initialize();
    this.fetchFixture = fetchFixture;
    this.fetchOdd = fetchOdd;
    console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

    // Get source league IDs mapped for YellowBet from your DB table
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);

    for (const league of leagues) {
      const sourceLeagueId = league.source_league_id.toString();
      const apiUrl = this.apiUrlTemplate.replace(
        "{sourceLeagueId}",
        sourceLeagueId
      );
      console.log(`Fetching fixtures for source league ID: ${sourceLeagueId}`);

      const response: YellowBetApiResponse = await fetchFromApi(apiUrl);
      if (!response?.data || response.data.length === 0) {
        console.warn(`⚠️ No fixtures received for league ${sourceLeagueId}`);
        continue;
      }

      for (const fixture of response.data) {
        if (this.fetchFixture) {
          await this.processFixture(fixture, league.league_id);
        }
        if (this.fetchOdd) {
          await this.processOdds(fixture);
        } else {
          console.warn(
            `⚠️ Skipping odds processing for fixture ID ${fixture.id}`
          );
        }
      }
    }

    console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
  }

  private async processFixture(
    fixture: YellowBetFixture,
    internalLeagueId: number
  ): Promise<boolean> {
    const sourceFixtureId = fixture.id.toString();
    const homeTeamRaw = fixture.h;
    const awayTeamRaw = fixture.a;
    const fixtureDate = new Date(fixture.gt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (fixtureDate < today) {
      console.log(`🗓️ Skipping past fixture: ${homeTeamRaw} vs ${awayTeamRaw}`);
      return false;
    }

    // Map team names via your teamNameMappings if available
    // const homeTeam = teamNameMappings[homeTeamRaw] || homeTeamRaw;
    // const awayTeam = teamNameMappings[awayTeamRaw] || awayTeamRaw;

    const leagueTeamMappings = this.teamNameMappings[internalLeagueId] || [];

    // Apply team name mappings only from this league
    const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamRaw)?.name ?? homeTeamRaw;
    const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamRaw)?.name ?? awayTeamRaw;

    // Match fixture in the database
    const matchedFixture = await db("fixtures")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select("fixtures.*", "leagues.id as parent_league_id")
      .whereRaw(
        `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
        [`%${homeTeam}%`, `%${awayTeam}%`]
      )
      .andWhere("fixtures.date", ">=", today)
      .andWhere("fixtures.league_id", internalLeagueId)
      .first();

    if (!matchedFixture) {
      console.warn(
        `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${internalLeagueId}`
      );
      return false;
    }

    // Insert into source_matches
    const result = await db("source_matches")
      .insert({
        source_fixture_id: sourceFixtureId,
        source_competition_id: fixture.lid.toString(), // use fixture.lid as competition id
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
        `✅ Inserted fixture: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
      );
    } else {
      console.warn(
        `⚠️ Duplicate fixture ignored: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
      );
    }

    return true;
  }

  private async processOdds(fixture: YellowBetFixture) {
    const sourceFixtureId = fixture.id.toString();

    // Lookup the fixture record from source_matches
    const fixtureRecord = await db("source_matches")
      .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select(
        "source_matches.source_fixture_id",
        "fixtures.id",
        "fixtures.date"
      )
      .where("source_matches.source_id", this.sourceId)
      .andWhere("source_matches.source_fixture_id", sourceFixtureId)
      .andWhere("fixtures.date", ">=", new Date())
      .andWhere("leagues.is_active", true)
      .first();

    if (!fixtureRecord) {
      console.warn(
        `❌ No fixture record found for source fixture ID ${sourceFixtureId}`
      );
      return;
    }

    // Process each bet type (bts) in the fixture
    if (!fixture.bts || fixture.bts.length === 0) {
      console.warn(
        `❌ No bet types (bts) found for fixture ${sourceFixtureId}`
      );
      return;
    }

    for (const betType of fixture.bts) {
      // Use the bet type id to look up the market name using marketMapping
      const groupName = this.groupMapping[betType.n];
      if (!groupName) {
        // Skip bet types not defined in the mapping
        continue;
      }

      // Find matching market in your DB by name.
      const dbGroup = this.dbGroups.find((m) => m.group_name === groupName);
      if (!dbGroup) {
        console.warn(
          `❌ No Group found for "${groupName}" in fixture ${sourceFixtureId}`
        );
        continue;
      }

      // Process each outcome in the bet type's odds array.
      for (const odd of betType.odds) {
        // Use the outcome code (oc) to map to a standardized outcome name.
        const outcome = this.outcomeNameNewMapping[odd.n];
        if (!outcome) {
          console.warn(
            `❌ No outcome mapping found for outcome code ${odd.oc} in fixture ${sourceFixtureId}`
          );
          continue;
        }

        if ((odd.n === "over" || odd.n === "under") && odd.l !== "2.5") {
          // Skip if the name is "Over" or "Under" and the handicap is not "2.5"
          continue;
        }

        // Find matching market type in your DB.
        const dbMarket = this.dbMarkets.find(
          (mt) =>
            mt.market_name.toLowerCase() === outcome.toLowerCase() &&
            mt.group_id === dbGroup.group_id
        );
        if (!dbMarket) {
          console.warn(
            `❌ No market found for outcome "${outcome}" in market "${groupName}"`
          );
          continue;
        }

        const coefficient = Number(odd.p);
        if (isNaN(coefficient)) {
          console.warn(
            `❌ Invalid coefficient for outcome "${odd.n}" in fixture ${sourceFixtureId}`
          );
          continue;
        }

        await this.saveMarketOutcome(
          dbGroup.group_id,
          coefficient,
          dbMarket.market_id,
          fixtureRecord.id,
          sourceFixtureId
        );
      }
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
      .merge(["coefficient"]);

    console.log("Odds data inserted/updated successfully.");
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

export default new FetchYellowBetFixturesWithOddsService();
