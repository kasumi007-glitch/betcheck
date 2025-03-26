import { db } from "../../infrastructure/database/Database";
import { teamNameMappings } from "../teamNameMappings";
import { httpClientFromApi } from "../../utils/HttpClient";
import GetAccessTokenService from "./GetAccessTokenService";

class FetchSuperGoalFixturesService {
  // Endpoint to fetch fixtures (with odds) for a given league.
  // The league id will be replaced in the URL.
  private readonly apiUrlTemplate =
    "https://online.meridianbet.com/betshop/api/v1/standard/sport/58/league?page=0&time=ONE_DAY&leagues={leagueId}";
  private readonly sourceName = "SUPERGOOAL";
  private sourceId!: number;
  private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

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
    await this.loadTeamNameMappings();
  }

  async syncFixtures() {
    await this.init();
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
        await this.matchAndStoreFixture(event, league);
      }
    }

    console.log("✅ SUPERGOOAL fixtures with odds synced successfully!");
  }

  private async matchAndStoreFixture(event: any, league: any) {
    const sourceFixtureId = event.header.eventId;
    const startTime = event.header.startTime; // Expecting a timestamp in milliseconds
    const eventDate = new Date(startTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      console.log(
        `🗓️ Skipping past fixture: ${event.header.code
        } ${event.header.rivals.join(" vs ")}`
      );
      return;
    }

    // Get team names from the rivals array.
    let homeTeamName = event.header.rivals[0];
    let awayTeamName = event.header.rivals[1];

    // // Apply any team name mappings.
    // homeTeam = teamNameMappings[homeTeamName] || homeTeamName;
    // awayTeam = teamNameMappings[awayTeamName] || awayTeamName;

    const leagueTeamMappings = this.teamNameMappings[league.league_id] || [];

    // Apply team name mappings only from this league
    const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
    const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

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
      return;
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

export default new FetchSuperGoalFixturesService();
