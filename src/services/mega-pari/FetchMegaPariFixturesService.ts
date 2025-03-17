import { db } from "../../infrastructure/database/Database";
import { fetchFromApi } from "../../utils/ApiClient";

class FetchMegaPariFixturesService {
  private readonly apiUrlTemplate =
    "https://megapari.com/service-api/LineFeed/Get1x2_VZip?sports=1&champs={sourceLeagueId}&count=20&lng=en&mode=4&getEmpty=true&virtualSports=true&countryFirst=true";
  private readonly sourceName = "MegaPari";
  private sourceId!: number;

  private readonly teamNameMappings: Record<string, string> = {
    "Austria Wien": "Austria Vienna",
    Hartberg: "TSV Hartberg",
    "Rheindorf Altach": "SCR Altach",
    "Blau-Weiß Linz": "FC BW Linz",
    "WSG Tirol": "WSG Wattens",
    "LASK Linz": "Lask Linz",
    "Rapid Wien": "Rapid Vienna",
    "Austria Klagenfurt": "Austria Klagenfurt",
    "Red Bull Salzburg": "Red Bull Salzburg",
    "Sturm Graz": "Sturm Graz",
    "Wolfsberger AC": "Wolfsberger AC",
    "Grazer AK": "Grazer AK",

    //For England
    "Newcastle United": "Newcastle",
    "Manchester United": "Manchester United",
    "Nottingham Forest": "Nottingham Forest",
    "Ipswich Town": "Ipswich",
    "Tottenham Hotspur": "Tottenham",
    Southampton: "Southampton",
    Liverpool: "Liverpool",
    "Wolverhampton Wanderers": "Wolves",
    Fulham: "Fulham",
    "AFC Bournemouth": "Bournemouth",
    "Leicester City": "Leicester",
    Arsenal: "Arsenal",
    "Aston Villa": "Aston Villa",
    Brentford: "Brentford",
    "Crystal Palace": "Crystal Palace",
    "Brighton & Hove Albion": "Brighton",
    "Manchester City": "Manchester City",
    Chelsea: "Chelsea",
    "West Ham United": "West Ham",
    Everton: "Everton",
  };

  async initialize() {
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
    console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

    // Fetch active leagues linked to MegaPari
    const leagues = await db("source_league_matches")
      .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
      .select(
        "source_league_matches.source_league_id",
        "leagues.external_id as league_id"
      )
      .where("source_league_matches.source_id", this.sourceId)
      .andWhere("leagues.is_active", true)
      .andWhere("leagues.external_id", 39);

    for (const league of leagues) {
      await this.fetchAndProcessFixtures(
        league.source_league_id,
        league.league_id
      );
    }

    console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
  }

  private async fetchAndProcessFixtures(
    sourceLeagueId: string,
    leagueId: number
  ) {
    const apiUrl = this.apiUrlTemplate.replace(
      "{sourceLeagueId}",
      sourceLeagueId
    );
    const response = await fetchFromApi(apiUrl);

    if (!response?.Value?.length) {
      console.warn(`⚠️ No fixtures received for league ID: ${sourceLeagueId}`);
      return;
    }

    for (const fixture of response.Value) {
      await this.processFixture(fixture, leagueId, sourceLeagueId);
    }
  }

  private async processFixture(
    fixture: any,
    leagueId: number,
    sourceLeagueId: string
  ) {
    const {
      I: sourceFixtureId,
      O1: homeTeamRaw,
      O2: awayTeamRaw,
      S: startTime,
    } = fixture;
    const eventDate = new Date(startTime * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    if (eventDate < today) {
      console.log(`🗓️ Skipping past fixture: ${homeTeamRaw} vs ${awayTeamRaw}`);
      return;
    }

    // **Apply Name Mapping for Home and Away Teams**
    const homeTeam = this.teamNameMappings[homeTeamRaw] || homeTeamRaw;
    const awayTeam = this.teamNameMappings[awayTeamRaw] || awayTeamRaw;

    // **Match fixture in database**
    let matchedFixture = await db("fixtures")
      .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
      .select(
        "fixtures.*",
        "leagues.name as league_name",
        "leagues.id as parent_league_id"
      )
      .whereRaw(
        `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
        [`%${homeTeam}%`, `%${awayTeam}%`]
      )
      .andWhere("fixtures.date", ">=", today)
      .andWhere("fixtures.league_id", leagueId)
      .first();

    if (!matchedFixture) {
      console.warn(
        `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${leagueId}`
      );
      return;
    }

    // **Insert into source_matches**
    const result = await db("source_matches")
      .insert({
        source_fixture_id: sourceFixtureId,
        source_competition_id: sourceLeagueId,
        source_event_name: `${homeTeam} vs ${awayTeam}`,
        fixture_id: matchedFixture.id,
        competition_id: matchedFixture.parent_league_id,
        source_id: this.sourceId,
      })
      .onConflict(["fixture_id", "source_id"])
      .ignore()
      .returning("*");

    if (result.length > 0) {
      console.log(
        `✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
      );
    } else {
      console.warn(
        `⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
      );
    }
  }
}

export default new FetchMegaPariFixturesService();
