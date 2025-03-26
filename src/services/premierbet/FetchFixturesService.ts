import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
import { teamNameMappings } from "../teamNameMappings";

class FetchFixturesService {
  private readonly apiUrlTemplate =
    "https://sports-api.premierbet.com/ci/v1/events?country=CI&group=g4&platform=desktop&locale=en&sportId=1&competitionId={leagueId}&isGroup=false";

  private readonly sourceName = "PREMIERBET";
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
    console.log("🚀 Fetching competitions data...");

    // Get all leagues for ONEBET from the source_league_matches table
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id",
        "source_league_matches.source_country_name as country_name"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);
      // .andWhere("source_league_matches.source_league_id", "1008226");

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for ONEBET in our database.");
      return;
    }

    for (const league of leagues) {
      const leagueId = league.source_league_id;
      const apiUrl = this.apiUrlTemplate.replace(
        "{leagueId}",
        String(leagueId)
      );
      const response = await httpClientFromApi(apiUrl);
      if (!response?.data?.categories.length) {
        console.warn("⚠️ No data received from API.");
        return;
      }
      for (const category of response.data.categories) {
        for (const competition of category.competitions) {
          await this.processCompetition(competition, league);
        }
      }
    }

    console.log("✅ Competitions data synced successfully!");
  }

  private async processCompetition(competition: any, league: any) {
    for (const event of competition.events) {
      await this.matchAndStoreEvent(event, competition.id, league);
    }
  }

  private async matchAndStoreEvent(
    event: any,
    competitionId: string,
    league: any
  ) {
    const { id: sourceFixtureId, eventNames, startTime } = event;

    const eventDate = new Date(startTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to start of day
    
    // Replace event names with mappings if available
    // const homeTeam = teamNameMappings[eventNames[0]] || eventNames[0];
    // const awayTeam = teamNameMappings[eventNames[1]] || eventNames[1];

    const leagueTeamMappings = this.teamNameMappings[league.league_id] || [];

    // Apply team name mappings only from this league
    const homeTeam = leagueTeamMappings.find(m => m.mapped_name === eventNames[0])?.name ?? eventNames[0];
    const awayTeam = leagueTeamMappings.find(m => m.mapped_name === eventNames[1])?.name ?? eventNames[1];

    if (eventDate >= today) {
      let fixture = await db("fixtures")
        .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
        .select(
          "fixtures.*",
          "leagues.id as parent_league_id",
          "leagues.name as league_name"
        )
        .whereRaw(
          `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
          [`%${homeTeam}%`, `%${awayTeam}%`]
        )
        .andWhere("date", ">=", today)
        .andWhere("leagues.external_id", league.league_id)
        .first();

      // if (!fixture) {
      //   console.log(`🔍 No exact match found. Trying fuzzy match...`);

      //   // Fuzzy match with similarity check
      //   fixture = await db("fixtures")
      //     .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      //     .select(
      //       "fixtures.*",
      //       "leagues.id as parent_league_id",
      //       "leagues.name as league_name"
      //     )
      //     .whereRaw(
      //       `SIMILARITY(LOWER(home_team_name), LOWER(?)) > 0.6 AND SIMILARITY(LOWER(away_team_name), LOWER(?)) > 0.6`,
      //       [homeTeam, awayTeam]
      //     )
      //     .andWhere("date", ">=", today)
      //     .first();
      // }

      if (fixture) {
        console.log(`✅ Matched fixture for event: ${homeTeam} vs ${awayTeam}`);

        const result = await db("source_matches")
          .insert({
            source_fixture_id: sourceFixtureId,
            source_competition_id: competitionId,
            source_event_name: `${homeTeam} vs ${awayTeam}`,
            fixture_id: fixture.id,
            competition_id: fixture.parent_league_id,
            source_id: this.sourceId,
          })
          .onConflict(["fixture_id", "source_id"])
          .ignore()
          .returning("*");

        if (result.length > 0) {
          console.log(
            `✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${fixture.id})`
          );
        } else {
          console.warn(
            `⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${fixture.id})`
          );
        }
      } else {
        console.warn(`⚠️ No match found for event: ${homeTeam} vs ${awayTeam}`);
      }
    } else {
      console.log(`🗓️ Skipping event with date ${eventDate} (before today)`);
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

export default new FetchFixturesService();
