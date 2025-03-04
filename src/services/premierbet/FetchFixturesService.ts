import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { teamNameMappings } from "../teamNameMappings";

class FetchFixturesService {
  private readonly apiUrl =
    "https://sports-api.premierbet.com/ci/v1/events?country=CI&group=g4&platform=desktop&locale=en&sportId=1&competitionId=1008226&isGroup=false";

  private readonly sourceName = "PremierBet";
  private sourceId!: number;

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
  }

  async syncFixtures() {
    console.log("🚀 Fetching competitions data...");
    const response = await fetchFromApi(this.apiUrl);

    if (!response?.data?.categories.length) {
      console.warn("⚠️ No data received from API.");
      return;
    }

    for (const category of response.data.categories) {
      for (const competition of category.competitions) {
        await this.processCompetition(competition);
      }
    }

    console.log("✅ Competitions data synced successfully!");
  }

  private async processCompetition(competition: any) {
    for (const event of competition.events) {
      await this.matchAndStoreEvent(event, competition.id);
    }
  }

  private async matchAndStoreEvent(event: any, competitionId: string) {
    const { id: sourceFixtureId, eventNames, startTime } = event;

    const eventDate = new Date(startTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to start of day

    // Replace event names with mappings if available
    const homeTeam = teamNameMappings[eventNames[0]] || eventNames[0];
    const awayTeam = teamNameMappings[eventNames[1]] || eventNames[1];

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

        // Fuzzy match with similarity check
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
}

export default new FetchFixturesService();
