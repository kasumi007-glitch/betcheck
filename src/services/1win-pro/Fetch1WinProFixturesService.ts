import { db } from "../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../utils/HttpClientCI";

class Fetch1WinProFixturesService {
    private readonly fixturesApiUrl = "https://api-gateway.top-parser.com/matches/get-many";
    private sourceId!: number;
    private readonly SOURCE_NAME = "1WINPRO";
    private readonly SPORT_ID = 18;
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.SOURCE_NAME).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.SOURCE_NAME }).returning("id"))[0];
        await this.loadTeamNameMappings();
    }

    async syncFixtures() {
        await this.init();

        const leagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_country_id", // if stored
                "source_league_matches.source_league_id",
                "leagues.external_id as league_id",
                "source_league_matches.source_country_name"
            )
            .where("source_league_matches.source_id", this.sourceId);

        for (const league of leagues) {
            const response = await fetchFromApiWithoutProxy(this.fixturesApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-lang": "en-001" },
                data: JSON.stringify({
                    service: "PREMATCH",
                    sportId: this.SPORT_ID,
                    tournamentId: parseInt(league.source_league_id),
                    categoryId: parseInt(league.source_country_id),
                    limit: 40,
                }),
            });

            const fixtures = response?.result?.items ?? [];
            for (const fixture of fixtures) {
                await this.processFixture(fixture, league.league_id);
            }
        }

        console.log("✅ TopParser fixtures synced successfully!");
    }

    private async processFixture(fixture: any, leagueId: number) {
        const sourceFixtureId = fixture.id;
        const competitionId = fixture.tournamentId;
        let homeTeam = fixture.homeTeam?.name?.trim() ?? "";
        let awayTeam = fixture.awayTeam?.name?.trim() ?? "";

        const mappings = this.teamNameMappings[leagueId] || [];
        homeTeam = mappings.find(m => m.mapped_name === homeTeam)?.name ?? homeTeam;
        awayTeam = mappings.find(m => m.mapped_name === awayTeam)?.name ?? awayTeam;

        const startDate = new Date(fixture.startAt * 1000);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (startDate < today) return;

        const dbFixture = await db("fixtures")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select("fixtures.*", "leagues.id as parent_league_id")
            .whereRaw("LOWER(home_team_name) ILIKE ?", [`%${homeTeam.toLowerCase()}%`])
            .whereRaw("LOWER(away_team_name) ILIKE ?", [`%${awayTeam.toLowerCase()}%`])
            .andWhereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.external_id", leagueId)
            .first();

        if (!dbFixture) return;

        const result = await db("source_matches")
            .insert({
                source_fixture_id: sourceFixtureId,
                source_competition_id: competitionId,
                source_event_name: `${homeTeam} vs ${awayTeam}`,
                fixture_id: dbFixture.id,
                competition_id: dbFixture.parent_league_id,
                source_id: this.sourceId,
            })
            .onConflict(["fixture_id", "source_id", "source_fixture_id"])
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
            acc[mapping.league_id].push({ name: mapping.name, mapped_name: mapping.mapped_name });
            return acc;
        }, {} as Record<number, { name: string; mapped_name: string }[]>);
    }
}

export default Fetch1WinProFixturesService;
