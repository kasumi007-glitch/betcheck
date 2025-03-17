import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";
import { leagueNameMappings } from "../leagueNameMappings";
import { teamNameMappings } from "../teamNameMappings";

class Fetch1WinLeaguesWithFixturesService {
  // URL to get all categories (countries)
  private readonly categoriesApiUrl =
    "https://match-storage-parsed.top-parser.com/categories/list?data=%7B%22lang%22:%22en%22,%22service%22:%22prematch%22%7D";
  // URL template to fetch matches (both leagues and fixtures) for a given category
  private readonly matchesApiUrlTemplate =
    "https://match-storage-parsed.top-parser.com/matches/list?data=%7B%22lang%22:%22en%22,%22localeId%22:82,%22service%22:%22prematch%22,%22categoryId%22:{categoryId},%22onlyOutrights%22:false%7D";
  private readonly sourceName = "1WIN";
  private sourceId!: number;
  private fetchLeague!: boolean;
  private fetchFixture!: boolean;

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

  async syncLeaguesAndFixtures(
    fetchLeague: boolean,
    fetchFixture: boolean = false
  ) {
    await this.init();
    this.fetchLeague = fetchLeague;
    this.fetchFixture = fetchFixture;
    console.log("🚀 Fetching 1WIN categories (countries)...");
    const categoriesResponse = await fetchFromApi(this.categoriesApiUrl);
    if (!categoriesResponse?.categories?.length) {
      console.warn("⚠️ No categories received from 1WIN API.");
      return;
    }

    // Filter categories to only those with sportId 18
    const countries = categoriesResponse.categories.filter(
      (cat: any) => cat.sportId === 18 && cat.name.trim() === "England"
    );

    // Process each country/category
    for (const country of countries) {
      const categoryId = country.id;
      const countryName = country.name.trim();
      console.log(`🔍 Processing country: ${countryName}`);

      // Find the country in our DB (by name)
      const dbCountry = await db("countries")
        .where("name", countryName)
        .andWhere("is_active", true)
        .first();
      if (!dbCountry) {
        console.warn(`⚠️ No match found for country: ${countryName}`);
        continue;
      }

      // Build URL to get matches for this category
      const matchesUrl = this.matchesApiUrlTemplate.replace(
        "{categoryId}",
        String(categoryId)
      );
      const matchesResponse = await fetchFromApi(matchesUrl);
      if (!matchesResponse?.matches?.length) {
        console.warn(`⚠️ No matches received for country: ${countryName}`);
        continue;
      }

      // Separate outright entries (leagues) from regular fixtures
      const leagueMatches = matchesResponse.matches.filter(
        (match: any) => match.outright === true
      );
      const fixtureMatches = matchesResponse.matches.filter(
        (match: any) => match.outright === false
      );

      if (this.fetchLeague) await this.processLeagues(dbCountry, leagueMatches);
      if (this.fetchFixture)
        await this.processFixtures(dbCountry, fixtureMatches);
    }

    console.log("✅ 1WIN leagues and fixtures synced successfully!");
  }

  private async processLeagues(dbCountry: any, leagues: any[]) {
    for (const league of leagues) {
      await this.processLeague(dbCountry, league);
    }
  }

  private async processLeague(dbCountry: any, league: any) {
    // Use tournamentId as our source league identifier
    const sourceLeagueId = league.tournamentId;
    // For outright entries, the homeTeamName typically holds the league/tournament name
    const sourceLeagueName = league.homeTeamName.trim();
    const countryName = dbCountry.name;

    // Optionally apply a name mapping
    const mappedLeagueName =
      leagueNameMappings[sourceLeagueName] || sourceLeagueName;

    // Find the league in our DB (by name and country code)
    const dbLeague = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .andWhere("is_active", true)
      .first();

    if (dbLeague) {
      console.log(`✅ Matched league: ${mappedLeagueName} in ${countryName}`);

      // Insert a record linking our DB league with the source league details
      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: countryName,
          league_id: dbLeague.id,
          country_code: dbCountry.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id"])
        .ignore()
        .returning("*");

      if (result.length > 0) {
        console.log(
          `✅ Inserted new league: ${sourceLeagueName} (League ID: ${dbLeague.id})`
        );
      } else {
        console.warn(
          `⚠️ Duplicate league ignored: ${sourceLeagueName} (League ID: ${dbLeague.id})`
        );
      }
    } else {
      console.warn(
        `⚠️ No DB match for league: ${sourceLeagueName} in ${countryName}`
      );
    }
  }

  private async processFixtures(dbCountry: any, fixtures: any[]) {
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_country_id",
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true)
      .andWhere("leagues.country_code", dbCountry.code)
      .andWhere("leagues.external_id", 39);

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for 1WIN in our database.");
      return;
    }

    const leagueIds = leagues.map((league) => Number(league.source_league_id));
    const filteredFixtures = fixtures.filter((match) =>
      leagueIds.includes(Number(match.tournamentId))
    );

    for (const match of filteredFixtures) {
      await this.processFixture(match, dbCountry);
    }
  }

  private async processFixture(match: any, dbCountry: any) {
    // Use the match id as our source fixture id.
    const sourceFixtureId = match.id;
    // Convert dateOfMatch (in seconds) to a Date object.
    const eventDate = new Date(match.dateOfMatch * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Skip past fixtures.
    if (eventDate < today) {
      console.log(`🗓️ Skipping past fixture: ${match.externalId}`);
      return;
    }

    // Process team names via mapping (trim to avoid extra spaces).
    const homeTeam =
      teamNameMappings[match.homeTeamName.trim()] || match.homeTeamName.trim();
    const awayTeam =
      teamNameMappings[match.awayTeamName?.trim() || ""] ||
      match.awayTeamName?.trim();

    // Update the fixture query to join the source_league_matches table.
    // This ensures we only find fixtures that belong to the league identified by match.tournamentId.
    let fixture = await db("fixtures")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .join(
        "source_league_matches",
        "source_league_matches.league_id",
        "=",
        "leagues.id"
      )
      .select("fixtures.*", "leagues.id as parent_league_id")
      .whereRaw(
        `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
        [`%${homeTeam}%`, `%${awayTeam}%`]
      )
      .andWhere("date", ">=", today)
      .andWhere("leagues.country_code", "=", dbCountry.code)
      .andWhere(
        "source_league_matches.source_league_id",
        "=",
        match.tournamentId
      )
      .andWhere("source_league_matches.source_id", "=", this.sourceId)
      .first();

    if (!fixture) {
      console.warn(
        `⚠️ No DB match found for fixture: ${homeTeam} vs ${awayTeam} in league ${match.tournamentId}`
      );
      return;
    }

    // Insert the fixture record into our source_matches table.
    const result = await db("source_matches")
      .insert({
        source_fixture_id: sourceFixtureId,
        source_competition_id: match.tournamentId, // Assuming tournamentId maps to league
        source_event_name: match.externalId, // Adjust if you have a different title field
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
        `⚠️ Duplicate fixture ignored: ${homeTeam} vs ${awayTeam} (Fixture ID: ${fixture.id})`
      );
    }
  }
}

export default new Fetch1WinLeaguesWithFixturesService();
