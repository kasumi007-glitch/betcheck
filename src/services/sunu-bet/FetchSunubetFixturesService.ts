// src/services/FetchSunubetFixturesService.ts
import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { httpClientFromApi } from "../../utils/HttpClient";
import { teamNameMappings } from "../teamNameMappings";

class FetchSunubetFixturesService {
  // SUNUBET fixture API endpoint; eventCategoryIds should be set to the source league id.
  private readonly apiUrlTemplate =
    "https://hg-event-api-prod.sporty-tech.net/api/events?eventCategoryIds={leagueId}&offset=0&length=21&fetchEventBetTypesMode=0&betTypeId=10001&timeFilter=All";
  private readonly sourceName = "SUNUBET";
  private sourceId!: number;
  private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

  async init() {
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
    console.log("🚀 Fetching Sunubet fixtures...");

    // Get all league records for SUNUBET from source_league_matches
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for Sunubet in our database.");
      return;
    }

    for (const league of leagues) {
      const leagueId = league.source_league_id;
      const apiUrl = this.apiUrlTemplate.replace(
        "{leagueId}",
        String(leagueId)
      );
      const response = await httpClientFromApi(apiUrl, {
        method: "GET",
        headers: {
          Referer: "https://sunubet.com/",
          accept: "application/json, text/plain, */*",
          "accept-language": "en",
        },
      });
      if (!response?.length) {
        console.warn(`⚠️ No fixture data for league id: ${leagueId}`);
        continue;
      }

      for (const fixture of response) {
        await this.matchAndStoreFixture(fixture, league);
      }
    }

    console.log("✅ Sunubet fixtures synced successfully!");
  }

  private async matchAndStoreFixture(fixtureData: any, league: any) {
    // Process team names with team mappings (if any)
    // const homeTeam =
    //   teamNameMappings[fixtureData.homeTeamName] || fixtureData.homeTeamName;
    // const awayTeam =
    //   teamNameMappings[fixtureData.awayTeamName] || fixtureData.awayTeamName;


    const leagueTeamMappings = this.teamNameMappings[league.league_id] || [];

    // Apply team name mappings only from this league
    const homeTeam = leagueTeamMappings.find(m => m.mapped_name === fixtureData.homeTeamName)?.name ?? fixtureData.homeTeamName;
    const awayTeam = leagueTeamMappings.find(m => m.mapped_name === fixtureData.awayTeamName)?.name ?? fixtureData.awayTeamName;

    // Convert expectedStart (ISO) to a Date object
    const eventDate = new Date(fixtureData.expectedStart);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today) {
      console.log(
        `🗓️ Skipping past fixture: ${fixtureData.homeTeamName} vs ${fixtureData.awayTeamName}`
      );
      return;
    }

    // Fuzzy match a fixture in your DB.
    // Adjust the query as needed. Here we use ILIKE with wildcards.
    // Fuzzy match a fixture in your DB with an added league filter.
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

    // Insert into source_matches table
    const result = await db("source_matches")
      .insert({
        source_fixture_id: fixtureData.id,
        source_competition_id: league.source_league_id,
        source_event_name:
          fixtureData.homeTeamName + " vs " + fixtureData.awayTeamName,
        fixture_id: fixture.id,
        competition_id: fixture.parent_league_id,
        source_id: this.sourceId,
      })
      .onConflict(["fixture_id", "source_id"])
      .ignore()
      .returning("*");

    if (result.length > 0) {
      console.log(`✅ Inserted fixture: ${homeTeam} vs ${awayTeam}`);
    } else {
      console.warn(`⚠️ Duplicate fixture: ${homeTeam} vs ${awayTeam}`);
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

export default new FetchSunubetFixturesService();
