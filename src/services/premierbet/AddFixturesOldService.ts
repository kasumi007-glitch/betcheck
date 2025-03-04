import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import fs from "fs";
import path from "path";

class AddFixturesOldService {
  private readonly apiUrlTemplate =
    "https://sports-api.premierbet.com/ci/v1/events?country=CI&group=g4&platform=desktop&locale=en&sportId=1&competitionId={sourceLeagueId}&isGroup=false";

  async syncFixtures() {
    console.log("🚀 Fetching fixtures data for all active leagues...");

    // Get all active leagues
    const activeLeagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.id as league_id"
      )
      .where("leagues.is_active", true);

    for (const league of activeLeagues) {
      console.log(
        `🔍 Processing fixtures for league ID: ${league.source_league_id}`
      );
      await this.fetchAndProcessFixturesForLeague(
        league.source_league_id,
        league.league_id
      );
    }

    console.log("✅ Fixtures data synced successfully!");
  }

  private async fetchAndProcessFixturesForLeague(
    sourceLeagueId: string,
    leagueId: number
  ) {
    const apiUrl = this.apiUrlTemplate.replace(
      "{sourceLeagueId}",
      sourceLeagueId
    );

    const response = await fetchFromApi(apiUrl);

    if (!response.data?.categories.length) {
      console.warn(`⚠️ No data received for league ID: ${sourceLeagueId}`);
      return;
    }

    for (const category of response.data.categories) {
      for (const competition of category.competitions) {
        for (const event of competition.events) {
          await this.matchAndStoreEvent(event, competition.id, leagueId);
        }
      }
    }
  }

  private async matchAndStoreEvent(
    event: any,
    competitionId: string,
    leagueId: number
  ) {
    const { id: sourceFixtureId, eventNames, startTime } = event;

    const eventDate = new Date(startTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to start of day

    const nameMappings: Record<string, string> = {
      "Wolverhampton Wanderers": "Wolves",
      "Brighton & Hove Albion": "Brighton",
      "AFC Bournemouth": "Bournemouth",
      "Tottenham Hotspur": "Tottenham",
      "Ipswich Town": "Ipswich",
      "Newcastle United": "Newcastle",
      "West Ham United": "West Ham",
      "Leicester City": "Leicester",
    };

    const homeTeam = nameMappings[eventNames[0]] || eventNames[0];
    const awayTeam = nameMappings[eventNames[1]] || eventNames[1];

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
        .first();

      if (!fixture) {
        console.log(`🔍 No exact match found. Trying fuzzy match...`);

        fixture = await db("fixtures")
          .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
          .select(
            "fixtures.*",
            "leagues.id as parent_league_id",
            "leagues.name as league_name"
          )
          .whereRaw(
            `SIMILARITY(LOWER(home_team_name), LOWER(?)) > 0.6 AND SIMILARITY(LOWER(away_team_name), LOWER(?)) > 0.6`,
            [homeTeam, awayTeam]
          )
          .andWhere("date", ">=", today)
          .first();
      }

      if (fixture) {
        console.log(
          `✅ Matched fixture for event: ${homeTeam} vs ${awayTeam} in ${fixture.league_name}`
        );

        await db("source_matches")
          .insert({
            source_fixture_id: sourceFixtureId,
            source_competition_id: competitionId,
            source_event_name: `${homeTeam} vs ${awayTeam}`,
            fixture_id: fixture.id,
            competition_id: fixture.parent_league_id,
          })
          .onConflict("fixture_id")
          .merge();

        console.log(`✅ Stored source match for fixture ID: ${fixture.id}`);
      } else {
        const logMessage = `⚠️ No match found for event: ${homeTeam} vs ${awayTeam} in league: ${leagueId}\n`;
        console.warn(logMessage);
        this.logUnmatchedEvent(logMessage);
      }
    } else {
      console.log(`🗓️ Skipping event with date ${eventDate} (before today)`);
    }
  }

  private logUnmatchedEvent(message: string) {
    const logFilePath = path.join(__dirname, "unmatchedEvents.log");
    fs.appendFileSync(logFilePath, message, "utf8");
  }
}

export default new AddFixturesOldService();
