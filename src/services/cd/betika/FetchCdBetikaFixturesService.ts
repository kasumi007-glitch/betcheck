import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";

class FetchCdBetikaFixturesService {
    private readonly apiUrl = "https://api-cd.betika.com/v1/uo/matches";
    private readonly sourceName = "CD_BETIKA";
    private sourceId!: number;
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    async initialize() {
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

    private async getSourceLeagues(): Promise<{ source_league_id: string; league_external_id: number; source_country_id: string }[]> {
        return await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "source_league_matches.source_country_id",
                "leagues.external_id as league_external_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);
    }

    async syncFixtures() {
        await this.initialize();
        console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

        const sourceLeagues = await this.getSourceLeagues();
        if (!sourceLeagues.length) {
            console.warn("⚠️ No source leagues found for CD_BETIKA.");
            return;
        }

        for (const league of sourceLeagues) {
            const url = `${this.apiUrl}?page=1&limit=100&tab=upcoming&sport_id=3&competition_id=${league.source_league_id}&sort_id=2&period_id=9&esports=false`;
            const response = await fetchFromApiWithoutProxy(url);

            const matches = response?.data ?? [];
            if (!matches.length) {
                console.warn(`⚠️ No matches found for league: ${league.source_league_id}`);
                continue;
            }

            for (const match of matches) {
                if (!match.parent_match_id) continue;
                await this.processFixture(match, league.league_external_id);
            }
        }

        console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
    }

    private async processFixture(match: any, leagueExternalId: number): Promise<boolean> {
        const sourceFixtureId = match.parent_match_id;
        const homeTeamName = match.home_team?.trim() || "";
        const awayTeamName = match.away_team?.trim() || "";

        const leagueTeamMappings = this.teamNameMappings[leagueExternalId] || [];
        const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
        const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

        const matchDate = new Date(match.start_time);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (matchDate < today) {
            console.log(`🗓️ Skipping past fixture: ${homeTeam} vs ${awayTeam}`);
            return false;
        }

        const matchedFixture = await db("fixtures")
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
            .andWhereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.external_id", leagueExternalId)
            .first();

        if (!matchedFixture) {
            console.warn(
                `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${leagueExternalId}`
            );
            return false;
        }

        const result = await db("source_matches")
            .insert({
                source_fixture_id: sourceFixtureId,
                source_competition_id: leagueExternalId,
                source_event_name: `${homeTeam} vs ${awayTeam}`,
                fixture_id: matchedFixture.id,
                competition_id: matchedFixture.parent_league_id,
                source_id: this.sourceId,
            })
            .onConflict(["fixture_id", "source_id", "source_fixture_id"])
            .ignore()
            .returning("*");

        if (result.length > 0) {
            console.log(
                `✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
            );
        }

        return result.length > 0;
    }

    private async loadTeamNameMappings() {
        const mappings = await db("team_name_mappings as tm")
            .join("leagues as l", "tm.league_id", "=", "l.external_id")
            .where("l.is_active", true)
            .select("tm.name", "tm.mapped_name", "l.external_id as league_id");

        this.teamNameMappings = mappings.reduce((acc, mapping) => {
            if (!acc[mapping.league_id]) {
                acc[mapping.league_id] = [];
            }
            acc[mapping.league_id].push({
                name: mapping.name,
                mapped_name: mapping.mapped_name
            });
            return acc;
        }, {} as Record<number, { name: string; mapped_name: string }[]>);
    }
}

export default FetchCdBetikaFixturesService;