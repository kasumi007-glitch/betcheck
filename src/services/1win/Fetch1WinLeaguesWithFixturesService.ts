import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
import { leagueNameMappings } from "../leagueNameMappings";
import { teamNameMappings } from "../teamNameMappings";
import fs from "fs";

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
  private countryNameMappings: Record<string, string> = {};
  private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};
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

    await this.loadCountryNameMappings();
    await this.loadLeagueNameMappings();
    await this.loadTeamNameMappings();
  }

  async syncLeaguesAndFixtures(
    fetchLeague: boolean,
    fetchFixture: boolean = false
  ) {
    await this.init();
    this.fetchLeague = fetchLeague;
    this.fetchFixture = fetchFixture;
    console.log("🚀 Fetching 1WIN categories (countries)...");
    const categoriesResponse = await httpClientFromApi(this.categoriesApiUrl);
    if (!categoriesResponse?.categories?.length) {
      console.warn("⚠️ No categories received from 1WIN API.");
      return;
    }

    // Filter categories to only those with sportId 18
    const countries = categoriesResponse.categories.filter(
      (cat: any) => cat.sportId === 18
    );

    // Process each country/category
    // const unmatchedCountries: any[] = [];

    // for (const country of countries) {
    //   const categoryId = country.id;
    //   const countryName = this.countryNameMappings[country.name.trim().toLowerCase()] ?? country.name.trim();
    //   console.log(`🔍 Processing country: ${countryName}`);

    //   // Find the country in our DB (by name)
    //   const dbCountry = await db("countries")
    //     .where("name", countryName)
    //     .first();
    //   if (!dbCountry) {
    //     console.warn(`⚠️ No match found for country: ${country.name.trim()}`);
    //     unmatchedCountries.push({ id: categoryId, name: countryName });
    //   }
    // }

    // Save unmatched countries to a JSON file in the service's directory
    // const filePath = __dirname + '/unmatchedCountries.json';
    // fs.writeFileSync(filePath, JSON.stringify(unmatchedCountries, null, 2));

    // Process each country/category
    for (const country of countries) {
      const categoryId = country.id;
      // const countryName = country.name.trim();
      const countryName = this.countryNameMappings[country.name.trim()] ?? country.name.trim();
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
      const matchesResponse = await httpClientFromApi(matchesUrl);
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
      if (this.fetchFixture) await this.processFixtures(dbCountry, fixtureMatches);
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

    // // Optionally apply a name mapping
    // const mappedLeagueName =
    //   leagueNameMappings[sourceLeagueName] || sourceLeagueName;


    // Get all league mappings for this specific country
    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    // Find the mapped league name if available
    const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
    const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

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
      .andWhere("leagues.country_code", dbCountry.code);

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for 1WIN in our database.");
      return;
    }

    const leagueIds = leagues.map((league) => Number(league.source_league_id));
    const filteredFixtures = fixtures.filter((match) =>
      leagueIds.includes(Number(match.tournamentId))
    );

    for (const match of filteredFixtures) {
      await this.processFixture(match, dbCountry, leagues);
    }
  }

  private async processFixture(match: any, dbCountry: any, leagues: any[]) {
    // Use the match id as our source fixture id.
    const sourceFixtureId = match.id;
    let leagueExternalId: number = 0;
    try {

      const leagueId = leagues.find(x => Number(x.source_league_id) === Number(match.tournamentId)).league_id;
      leagueExternalId = Number(leagueId);
    } catch (error) {
      console.log(`🗓️ Skipping past fixture: ${match.externalId}`);
    }
    // Convert dateOfMatch (in seconds) to a Date object.
    const eventDate = new Date(match.dateOfMatch * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Skip past fixtures.
    if (eventDate < today) {
      console.log(`🗓️ Skipping past fixture: ${match.externalId}`);
      return;
    }

    // // Process team names via mapping (trim to avoid extra spaces).
    // const homeTeam =
    //   teamNameMappings[match.homeTeamName.trim()] || match.homeTeamName.trim();
    // const awayTeam =
    //   teamNameMappings[match.awayTeamName?.trim() || ""] ||
    //   match.awayTeamName?.trim();

    const leagueTeamMappings = this.teamNameMappings[leagueExternalId] || [];

    const homeTeamName = match?.homeTeamName?.trim() || "";
    const awayTeamName = match?.awayTeamName?.trim() || "";

    // Apply team name mappings only from this league
    const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
    const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

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

  private async loadCountryNameMappings() {
    console.log("🔄 Loading country name mappings...");
    const mappings = await db("country_name_mappings").select("name", "mapped_name");
    this.countryNameMappings = mappings.reduce((acc, mapping) => {
      acc[mapping.mapped_name] = mapping.name;
      return acc;
    }, {} as Record<string, string>);
    console.log("✅ Country name mappings loaded.");
  }

  private async loadLeagueNameMappings() {
    console.log("🔄 Loading filtered league name mappings by country...");

    const mappings = await db("league_name_mappings as lm")
      .join("leagues as l", "lm.league_id", "=", "l.external_id")
      .join("countries as c", "l.country_code", "=", "c.code")
      .where("c.is_active", true) // Ensure country is active
      .select("lm.name", "lm.mapped_name", "l.country_code");

    // Group league mappings by country and store as an array
    this.leagueNameMappings = mappings.reduce((acc, mapping) => {
      if (!acc[mapping.country_code]) {
        acc[mapping.country_code] = []; // Initialize an empty array for each country
      }
      acc[mapping.country_code].push({
        name: mapping.name,
        mapped_name: mapping.mapped_name
      });
      return acc;
    }, {} as Record<string, { name: string; mapped_name: string }[]>);

    console.log("✅ Filtered league name mappings categorized by country loaded.");
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

export default new Fetch1WinLeaguesWithFixturesService();
