// src/services/1win/Fetch1WinFixturesService.ts

import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { teamNameMappings } from "../teamNameMappings";

class Fetch1WinFixturesService {
  // Endpoint template to fetch matches (fixtures) for a given country (category)
  private readonly matchesApiUrlTemplate =
    "https://match-storage-parsed.top-parser.com/matches/list?data=%7B%22lang%22:%22en%22,%22localeId%22:82,%22service%22:%22prematch%22,%22categoryId%22:{categoryId},%22onlyOutrights%22:false%7D";
  private readonly sourceName = "1WIN";
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
    console.log("🚀 Fetching 1WIN fixtures...");

    // Get all league records previously stored for 1WIN
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_country_id", // if stored
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id",
        "source_league_matches.source_country_name"
      )
      .where("source_league_matches.source_id", this.sourceId);

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for 1WIN in our database.");
      return;
    }

    for (const league of leagues) {
      // Here we assume we have stored the country id in source_league_matches.
      // If not, you might need to determine the categoryId (country id) via other means.
      const categoryId = league.source_country_id;
      if (!categoryId) {
        console.warn(
          `⚠️ No categoryId stored for league id: ${league.source_league_id}`
        );
        continue;
      }
      const apiUrl = this.matchesApiUrlTemplate.replace(
        "{categoryId}",
        String(categoryId)
      );
      const response = await fetchFromApi(apiUrl);
      if (!response?.matches?.length) {
        console.warn(
          `⚠️ No match data for country/category id: ${categoryId}`
        );
        continue;
      }

      // Process only fixtures (non-outright matches)
      const fixtureMatches = response.matches.filter(
        (match: any) => match.outright === false
      );

      for (const match of fixtureMatches) {
        await this.matchAndStoreFixture(match, league);
      }
    }

    console.log("✅ 1WIN fixtures synced successfully!");
  }

  private async matchAndStoreFixture(match: any, league: any) {
    // Use the match id as the source fixture id.
    const sourceFixtureId = match.id;
    // Convert dateOfMatch (in seconds) to a Date object
    const eventDate = new Date(match.dateOfMatch * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      console.log(`🗓️ Skipping past fixture: ${match.externalId}`);
      return;
    }

    // Process team names using mappings
    const homeTeam =
      teamNameMappings[match.homeTeamName.trim()] || match.homeTeamName.trim();
    const awayTeam =
      teamNameMappings[match.awayTeamName?.trim() || ""] ||
      match.awayTeamName?.trim();

    // Attempt to find a matching fixture in our DB (using fuzzy matching on team names)
    let fixture = await db("fixtures")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select("fixtures.*", "leagues.id as parent_league_id")
      .whereRaw(
        `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
        [`%${homeTeam}%`, `%${awayTeam}%`]
      )
      .andWhere("date", ">=", today)
      .first();

    if (!fixture) {
      console.warn(
        `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam}`
      );
      return;
    }

    const result = await db("source_matches")
      .insert({
        source_fixture_id: sourceFixtureId,
        source_competition_id: league.source_league_id,
        source_event_name: match.externalId, // or any title field available
        fixture_id: fixture.id,
        competition_id: fixture.parent_league_id,
        source_id: this.sourceId,
      })
      .onConflict(["fixture_id", "source_id"])
      .ignore()
      .returning("*");

    if (result.length > 0) {
      console.log(
        `✅ Inserted fixture: ${homeTeam} vs ${awayTeam} (Fixture ID: ${fixture.id})`
      );
    } else {
      console.warn(
        `⚠️ Duplicate fixture: ${homeTeam} vs ${awayTeam} (Fixture ID: ${fixture.id})`
      );
    }
  }
}

export default new Fetch1WinFixturesService();
