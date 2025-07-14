import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientAO";
import { parse } from 'node-html-parser';

class Fetch888BetsFixturesService {
    private readonly fixturesApiUrlTemplate = "https://888bets.co.ao/SportsPage/LeagueMatches?sportname=football&strCountry={country}&market=&leagueid={leagueId}";
    private readonly sourceName = "AO_888BET";
    private sourceId!: number;
    private teamNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadTeamNameMappings();
    }

    async syncFixtures() {
        await this.init();

        const sourceLeagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "source_league_matches.source_country_name",
                "leagues.external_id as league_id",
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of sourceLeagues) {
            const apiUrl = this.fixturesApiUrlTemplate
                .replace("{country}", encodeURIComponent(league.source_country_name))
                .replace("{leagueId}", league.source_league_id);

            const response = await fetchFromApiWithoutProxy(apiUrl, {
                headers: {
                    'Cookie': 'UserCulture=en-US'
                }
            });

            const html = parse(response.sportsLeagueData );
            const matchBoxes = html.querySelectorAll('.SB-matchBox');

            for (const matchBox of matchBoxes) {
                await this.processFixture(matchBox, league);
            }
        }

        console.log("✅ 888Bets fixtures synced successfully!");
    }

    private async processFixture(matchBox: any, league: any) {
        const sourceFixtureId = matchBox.getAttribute('data-socketeventid');
        const homeTeam = matchBox.querySelector('.SB-match__teamName.home')?.text.trim();
        const awayTeam = matchBox.querySelector('.SB-match__teamName.away')?.text.trim();
        const kickoffInfo = matchBox.querySelector('.SB-match__kickOffInfo');
        const time = kickoffInfo?.querySelector('.SB-time')?.text.trim();
        const dateStr = kickoffInfo?.querySelector('.SB-date')?.text.trim();

        if (!homeTeam || !awayTeam || !sourceFixtureId) return;

        // Apply team name mapping
        const mappings = this.teamNameMappings[league.league_id] || [];
        const mappedHomeTeam = mappings.find(m => m.mapped_name === homeTeam)?.name || homeTeam;
        const mappedAwayTeam = mappings.find(m => m.mapped_name === awayTeam)?.name || awayTeam;

        const dbFixture = await db("fixtures")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select("fixtures.*", "leagues.id as parent_league_id")
            .whereRaw("LOWER(home_team_name) ILIKE ?", [`%${mappedHomeTeam.toLowerCase()}%`])
            .whereRaw("LOWER(away_team_name) ILIKE ?", [`%${mappedAwayTeam.toLowerCase()}%`])
            .andWhere("fixtures.date", ">=", "NOW()")
            .andWhere("leagues.external_id", league.league_id)
            .first();

        if (!dbFixture) return;

        const result = await db("source_matches").insert({
            source_fixture_id: sourceFixtureId,
            source_competition_id: league.source_league_id,
            source_event_name: `${homeTeam} v ${awayTeam}`,
            fixture_id: dbFixture.id,
            competition_id: dbFixture.parent_league_id,
            source_id: this.sourceId,
        }).onConflict(["fixture_id", "source_id", "source_fixture_id"])
            .ignore()
            .returning("*");

        if (result.length > 0) {
            console.log(`✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`);
        } else {
            console.warn(`⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`);
        }
    }

    private async loadTeamNameMappings() {
        const mappings = await db("team_name_mappings as tm")
            .join("leagues as l", "tm.league_id", "=", "l.external_id")
            .where("l.is_active", true)
            .select("tm.name", "tm.mapped_name", "l.external_id as league_id");

        this.teamNameMappings = mappings.reduce((acc, mapping) => {
            if (!acc[mapping.league_id]) acc[mapping.league_id] = [];
            acc[mapping.league_id].push({
                name: mapping.name,
                mapped_name: mapping.mapped_name
            });
            return acc;
        }, {} as Record<string, { name: string; mapped_name: string }[]>);
    }
}

export default Fetch888BetsFixturesService;