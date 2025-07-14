import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCG";
import { parse } from 'node-html-parser';

class FetchEliteBetFixturesService {
    private readonly fixturesApiUrlTemplate = "https://elitebet.cg/?view=competition&sport=Sport_Football&group={groupId}&competition={leagueId}";
    private readonly sourceName = "CG_ELITEBET";
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
                "source_league_matches.source_country_id as group_id",
                "leagues.external_id as league_id",
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of sourceLeagues) {
            const apiUrl = this.fixturesApiUrlTemplate
                .replace("{groupId}", league.group_id)
                .replace("{leagueId}", league.source_league_id);

            const response = await fetchFromApiWithoutProxy(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
                }
            });

            const html = parse(response);
            const events = html.querySelectorAll('.EVENT');

            for (const event of events) {
                await this.processFixture(event, league);
            }
        }

        console.log("✅ EliteBet fixtures synced successfully!");
    }

    private async processFixture(event: any, league: any) {
        const sourceFixtureId = event.id.replace('EV-', '');
        const infoDiv = event.querySelector('.info');
        const competitorsDiv = infoDiv?.querySelector('.competitors');
        const competitionDiv = infoDiv?.querySelector('.competition');

        if (!competitorsDiv || !competitionDiv) return;

        const [homeTeam, awayTeam] = competitorsDiv.text.split(' - ').map((t: any) => t.trim());
        const competitionName = competitionDiv.text.split(',')[0].trim();

        if (!homeTeam || !awayTeam) return;

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

export default FetchEliteBetFixturesService;