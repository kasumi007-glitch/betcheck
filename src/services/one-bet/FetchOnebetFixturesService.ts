// services/onebet/FetchOnebetFixturesService.ts
import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { httpClientFromApi } from "../../utils/HttpClient";
import { teamNameMappings } from "../teamNameMappings";

class FetchOnebetFixturesService {
  // ONEBET API endpoint to get match fixtures by tournament_id.
  private readonly apiUrl = "https://api.cmonebet.com/sports/get/match";
  private readonly sportId = 1;
  private readonly lang = "en";
  private readonly sourceName = "ONEBET";
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
    await this.init();
    console.log("🚀 Fetching ONEBET fixtures...");

    // Get all leagues for ONEBET from the source_league_matches table
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id",
        "source_league_matches.source_country_name as country_name"
      )
      .where("source_league_matches.source_id", this.sourceId);

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for ONEBET in our database.");
      return;
    }

    for (const league of leagues) {
      const params = new URLSearchParams({
        sport_id: String(this.sportId),
        tournament_id: String(league.source_league_id),
        Lang: this.lang,
      }).toString();

      const response = await httpClientFromApi(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9",
        },
        data: params,
      });

      if (!response?.data?.result?.length) {
        console.warn(
          `⚠️ No fixtures data for league id: ${league.source_league_id}`
        );
        continue;
      }
      await this.processFixtures(response.data.result, league);
    }

    console.log("✅ ONEBET fixtures synced successfully!");
  }

  private async processFixtures(fixtures: any[], league: any) {
    for (const match of fixtures) {
      await this.matchAndStoreFixture(match, league);
    }
  }

  private async matchAndStoreFixture(match: any, league: any) {
    // Use match_id as the unique ONEBET fixture identifier.
    const sourceFixtureId = match.match_id;
    // Convert start_time (assumed Unix timestamp) to a JS Date.
    const eventDate = new Date(match.start_time * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      console.log(
        `🗓️ Skipping past fixture: ${match.home_name} vs ${match.away_name}`
      );
      return;
    }

    // Apply team name mappings if available
    const homeTeam = teamNameMappings[match.home_name] || match.home_name;
    const awayTeam = teamNameMappings[match.away_name] || match.away_name;

    // Attempt to find a matching fixture in our DB (using fuzzy matching on team names)
    let fixture = await db("fixtures")
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
        source_event_name: `${match.home_name} vs ${match.away_name}`,
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
}

export default new FetchOnebetFixturesService();
