import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClient";
import { teamNameMappings } from "../teamNameMappings";

class FetchBetclicFixturesService {
  // API URL template to get fixtures by country id and league id.
  // Note: lc[]=1 is hardcoded for sport (soccer) here.
  private readonly apiUrlTemplate =
    "https://uodyc08.com/api/v3/user/line/list?lc[]=1&lsc={countryId}&lsubc={leagueId}&ss=all&l=20&ltr=0";
  private readonly sourceName = "BETCLIC";
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
    console.log("🚀 Fetching Betclic fixtures...");

    // Get all league records previously stored for Betclic
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_country_id",
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true);

    if (!leagues.length) {
      console.warn("⚠️ No leagues found for Betclic in our database.");
      return;
    }

    for (const league of leagues) {
      // Use the stored source_country_id (from the leagues service)
      const countryId = league.source_country_id;
      const leagueId = league.source_league_id;
      const apiUrl = this.apiUrlTemplate
        .replace("{countryId}", String(countryId))
        .replace("{leagueId}", String(leagueId));
      const response = await httpClientFromApi(apiUrl);
      if (!response?.lines_hierarchy?.length) {
        console.warn(`⚠️ No fixture data for league id: ${leagueId}`);
        continue;
      }
      await this.processFixtures(response.lines_hierarchy, league);
    }

    console.log("✅ Betclic fixtures synced successfully!");
  }

  private async processFixtures(linesHierarchy: any[], league: any) {
    const fixtureLines = this.extractFixtureLines(linesHierarchy);
    for (const line of fixtureLines) {
      await this.matchAndStoreFixture(line, league);
    }
  }

  private extractFixtureLines(hierarchy: any[]): any[] {
    let fixtureLines: any[] = [];
    for (const lineType of hierarchy) {
      const categories = lineType.line_category_dto_collection || [];
      fixtureLines = fixtureLines.concat(
        this.extractFromCategories(categories)
      );
    }
    return fixtureLines;
  }

  private extractFromCategories(categories: any[]): any[] {
    let fixtureLines: any[] = [];
    for (const category of categories) {
      const superCategories = category.line_supercategory_dto_collection || [];
      fixtureLines = fixtureLines.concat(
        this.extractFromSuperCategories(superCategories)
      );
    }
    return fixtureLines;
  }

  private extractFromSuperCategories(superCategories: any[]): any[] {
    let fixtureLines: any[] = [];
    for (const superCat of superCategories) {
      const subCategories = superCat.line_subcategory_dto_collection || [];
      fixtureLines = fixtureLines.concat(
        this.extractFromSubCategories(subCategories)
      );
    }
    return fixtureLines;
  }

  private extractFromSubCategories(subCategories: any[]): any[] {
    let fixtureLines: any[] = [];
    for (const subCat of subCategories) {
      const lines = subCat.line_dto_collection || [];
      fixtureLines = fixtureLines.concat(lines);
    }
    return fixtureLines;
  }

  private async matchAndStoreFixture(line: any, league: any) {
    // Use the line id as the source fixture id.
    const sourceFixtureId = line.id;
    const match = line.match;
    if (!match) return;

    // Betclic returns begin_at in seconds (assumed)
    const eventDate = new Date(match.begin_at * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      console.log(`🗓️ Skipping past fixture: ${match.title}`);
      return;
    }

    // Process team names with your mappings
    // const homeTeam = teamNameMappings[match.team1.title] || match.team1.title;
    // const awayTeam = teamNameMappings[match.team2.title] || match.team2.title;

    const leagueTeamMappings = this.teamNameMappings[league.league_id] || [];

    const homeTeamName = match.team1.title || "";
    const awayTeamName = match.team2.title || "";

    // Apply team name mappings only from this league
    const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
    const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

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
      console.warn(`⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam}`);
      return;
    }

    const result = await db("source_matches")
      .insert({
        source_fixture_id: sourceFixtureId,
        source_competition_id: league.source_league_id,
        source_event_name: match.title,
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

export default new FetchBetclicFixturesService();
