import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../../utils/HttpClientSL";

class FetchBWinnersFixturesService {
    private readonly fixturesApiUrl = "https://bwinners.sl/services/evapi/event/GetEvents?betTypeIds=-1&take=100&statusId=0&eventTypeId=0";
    private readonly sourceName = "SL_BWINNERS";
    private sourceId!: number;
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadTeamNameMappings();
    }

    async syncFixtures() {
        await this.init();
        console.log("🚀 Fetching BWinners fixtures...");

        const sourceLeagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id as leagueIds",
                "leagues.external_id as league_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of sourceLeagues) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dateFrom = today.toISOString().split('T')[0] + 'T00:00:00Z';

            const url = `${this.fixturesApiUrl}&leagueIds=${league.leagueIds}&DateFrom=${encodeURIComponent(dateFrom)}`;

            const response = await httpClientFromApi(url);

            const events = response?.data || [];
            if (!events.length) {
                console.warn(`⚠️ No events found for league: ${league.leagueIds}`);
                continue;
            }

            for (const event of events) {
                await this.processFixture(event, league.league_id);
            }
        }

        console.log("✅ BWinners fixtures synced successfully!");
    }

    private async processFixture(event: any, leagueId: number): Promise<boolean> {
        const sourceFixtureId = event.id;
        const homeTeamName = event.h || "";
        const awayTeamName = event.a || "";

        const leagueTeamMappings = this.teamNameMappings[leagueId] || [];
        const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
        const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

        const eventDate = new Date(event.gt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (eventDate < today) {
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
            .andWhere("leagues.external_id", leagueId)
            .first();

        if (!matchedFixture) {
            console.warn(
                `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${leagueId}`
            );
            return false;
        }

        const result = await db("source_matches")
            .insert({
                source_fixture_id: sourceFixtureId.toString(),
                source_competition_id: leagueId.toString(),
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
        } else {
            console.warn(
                `⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
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
            const leagueId = parseInt(mapping.league_id);
            if (!acc[leagueId]) acc[leagueId] = [];
            acc[leagueId].push({
                name: mapping.name,
                mapped_name: mapping.mapped_name
            });
            return acc;
        }, {} as Record<number, { name: string; mapped_name: string }[]>);
    }
}

export default FetchBWinnersFixturesService;