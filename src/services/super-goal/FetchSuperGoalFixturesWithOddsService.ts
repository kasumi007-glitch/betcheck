import { db } from "../../infrastructure/database/Database";
import { teamNameMappings } from "../teamNameMappings";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { httpClientFromApi } from "../../utils/HttpClient";
import GetAccessTokenService from "./GetAccessTokenService";

class FetchSuperGoalFixturesWithOddsService {
  // Endpoint to fetch fixtures (with odds) for a given league.
  // The league id will be replaced in the URL.
  private readonly apiUrlTemplate =
    "https://online.meridianbet.com/betshop/api/v1/standard/sport/58/league?page=0&time=ONE_DAY&leagues={leagueId}";
  private readonly sourceName = "SUPERGOOAL";
  private sourceId!: number;

  // Market mapping: maps the market/group names from SUPERGOOAL to your internal market names.
  private readonly groupMapping: Record<string, string> = {
    "Final Score": "1X2",
    "Total Goals": "Over / Under",
    "Both Teams To Score": "Both Teams to Score",
    // Extend mapping as needed.
  };

  // Outcome mapping: maps the outcome names/aliases to internal outcome names.
  private readonly outcomeNameMapping: Record<string, string> = {
    "1": "1",
    X: "X",
    "2": "2",
    Under: "Under",
    Over: "Over",
    GG: "Yes",
    "GG&3+": "Yes",
    "GG&4+": "Yes",
    // Extend mapping as needed.
  };

  private dbGroups: Group[] = [];
  private dbMarkets: Market[] = [];

  async init() {
    // Get source id (insert if not exists)
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    // Preload internal market and market type data.
    this.dbGroups = await db("groups");
    this.dbMarkets = await db("markets");
  }

  async syncFixturesAndOdds() {
    console.log("🚀 Fetching SUPERGOOAL fixtures with odds...");

    // Get all league mappings for SUPERGOOAL from your source_league_matches table.
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id",
        "source_league_matches.source_country_id"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for SUPERGOOAL in our database.");
      return;
    }

    const token = await GetAccessTokenService.getAccessToken();

    for (const league of leagues) {
      const leagueId = league.source_league_id;
      const apiUrl = this.apiUrlTemplate.replace(
        "{leagueId}",
        String(leagueId)
      );
      const response = await httpClientFromApi(apiUrl, {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en",
          authorization: `Bearer ${token}`, // Replace with your token
        },
      });
      if (!response?.payload?.leagues) {
        console.warn(`⚠️ No fixture data for league id: ${leagueId}`);
        continue;
      }
      // Find the league data in the response payload that matches our league id.
      //   const leagueData = response.payload.leagues.find(
      //     (l: any) => l.leagueId === Number(leagueId)
      //   );

      const leagueData = response.payload.leagues[0];

      if (!leagueData) {
        console.warn(`⚠️ League data not found for league id: ${leagueId}`);
        continue;
      }

      for (const event of leagueData.events) {
        const processed = await this.matchAndStoreFixture(event, league);
        if (processed) {
          // After storing the fixture, process its odds
          await this.processOddsForEvent(event, league);
        } else {
          console.warn(
            `⚠️ Skipping odds processing for fixture ID ${event.header.eventId}`
          );
        }
      }
    }

    console.log("✅ SUPERGOOAL fixtures with odds synced successfully!");
  }

  private async matchAndStoreFixture(
    event: any,
    league: any
  ): Promise<boolean> {
    const sourceFixtureId = event.header.eventId;
    const startTime = event.header.startTime; // Expecting a timestamp in milliseconds
    const eventDate = new Date(startTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      console.log(
        `🗓️ Skipping past fixture: ${
          event.header.code
        } ${event.header.rivals.join(" vs ")}`
      );
      return false;
    }

    // Get team names from the rivals array.
    let homeTeam = event.header.rivals[0];
    let awayTeam = event.header.rivals[1];

    // Apply any team name mappings.
    homeTeam = teamNameMappings[homeTeam] || homeTeam;
    awayTeam = teamNameMappings[awayTeam] || awayTeam;

    // Fuzzy match the fixture in your DB using ILIKE with wildcards and apply league filter.
    const fixture = await db("fixtures")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select("fixtures.*", "leagues.id as parent_league_id")
      .whereRaw(
        `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
        [`%${homeTeam}%`, `%${awayTeam}%`]
      )
      .andWhere("date", ">=", today)
      .andWhere("leagues.external_id", league.league_id)
      .first();

    if (!fixture) {
      console.warn(`⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam}`);
      return false;
    }

    const result = await db("source_matches")
      .insert({
        source_fixture_id: sourceFixtureId,
        source_competition_id: league.source_league_id,
        source_event_name: event.header.rivals.join(" vs "),
        fixture_id: fixture.id,
        competition_id: fixture.parent_league_id,
        source_id: this.sourceId,
      })
      .onConflict(["fixture_id", "source_id"])
      .ignore()
      .returning("*");

    if (result.length > 0) {
      console.log(`✅ Inserted fixture mapping: ${homeTeam} vs ${awayTeam}`);
    } else {
      console.log(
        `⚠️ Duplicate fixture mapping ignored: ${homeTeam} vs ${awayTeam}`
      );
    }

    return true;
  }

  private async processOddsForEvent(event: any, league: any) {
    if (!event.positions?.length) {
      console.warn(`⚠️ No odds details for event id: ${event.header.eventId}`);
      return;
    }

    for (const position of event.positions) {
      if (!position.groups) continue;
      for (const group of position.groups) {
        await this.processOddsGroup(group, event);
      }
    }
  }

  private async processOddsGroup(group: any, event: any) {
    const groupName = this.groupMapping[group.name] || group.name;
    const dbGroup = this.dbGroups.find(
      (m) => m.group_name.toLowerCase() === groupName.toLowerCase()
    );
    if (!dbGroup) {
      console.warn(`❌ No Group found for: ${groupName}`);
      return;
    }
    if (!group.selections?.length) return;

    const fixtureMapping = await db("source_matches")
      .select("fixture_id")
      .where("source_fixture_id", event.header.eventId)
      .andWhere("source_id", this.sourceId)
      .first();

    const fixtureId = fixtureMapping?.fixture_id;

    for (const outcome of group.selections) {
      await this.processOutcome(
        outcome,
        dbGroup,
        fixtureId,
        event.header.eventId
      );
    }
  }

  private async processOutcome(
    outcome: any,
    dbGroup: Group,
    fixtureId: number,
    sourceFixtureId: string
  ) {
    const outcomeName = this.outcomeNameMapping[outcome.name] || outcome.name;
    const dbMarket = this.dbMarkets.find(
      (mt) =>
        mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
        mt.group_id === dbGroup.group_id
    );
    if (!dbMarket) {
      console.warn(`❌ No market found for outcome: ${outcome.name}`);
      return;
    }

    await this.saveMarketOutcome(
      dbGroup.group_id,
      Number(outcome.price),
      dbMarket.market_id,
      fixtureId,
      String(sourceFixtureId)
    );
  }

  // Helper method to get the internal fixture id based on the source_fixture_id.
  private async getFixtureIdBySourceFixtureId(
    sourceFixtureId: string
  ): Promise<number> {
    const fixtureMapping = await db("source_matches")
      .select("fixture_id")
      .where("source_fixture_id", sourceFixtureId)
      .andWhere("source_id", this.sourceId)
      .first();
    return fixtureMapping?.fixture_id;
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
    console.log("Odds inserted/updated successfully.");
  }
}

export default new FetchSuperGoalFixturesWithOddsService();
