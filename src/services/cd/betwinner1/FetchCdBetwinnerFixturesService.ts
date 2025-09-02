import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";

class FetchCdBetwinnerFixturesService {
    private readonly apiUrlTemplate = "https://betwinner1.com/service-api/LineFeed/GetChampZip?sport=1&champ={leagueId}&lng=en&partner=152&country=213";
    private readonly sourceName = "CD_BETWINNER";
    private sourceId!: number;
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadTeamNameMappings();
    }

    async syncFixtures() {
        await this.init();

        const leagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "leagues.external_id as league_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of leagues) {
            const apiUrl = this.apiUrlTemplate.replace("{leagueId}", league.source_league_id);
            const response = await fetchFromApiWithoutProxy(apiUrl);

            if (!response?.Success || !response.Value?.G) continue;

            for (const match of response.Value.G) {
                await this.processFixture(match, league.league_id);
            }
        }

        console.log("✅ Betwinner fixtures synced successfully!");
    }

    private async processFixture(match: any, leagueId: number) {
        const sourceFixtureId = match.I;
        const homeTeam = match.O1?.trim() ?? "";
        const awayTeam = match.O2?.trim() ?? "";

        if (!homeTeam || !awayTeam) return;

        // Apply team name mapping
        const mappings = this.teamNameMappings[leagueId] || [];
        const mappedHomeTeam = mappings.find(m => m.mapped_name === homeTeam)?.name ?? homeTeam;
        const mappedAwayTeam = mappings.find(m => m.mapped_name === awayTeam)?.name ?? awayTeam;

        const eventDate = new Date(match.S * 1000);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (eventDate < today) return;

        const dbFixture = await db("fixtures")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select("fixtures.*", "leagues.id as parent_league_id")
            .whereRaw("LOWER(home_team_name) ILIKE ?", [`%${mappedHomeTeam.toLowerCase()}%`])
            .whereRaw("LOWER(away_team_name) ILIKE ?", [`%${mappedAwayTeam.toLowerCase()}%`])
            .andWhereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.external_id", leagueId.toString())
            .first();

        if (!dbFixture) return;

        const result = await db("source_matches").insert({
            source_fixture_id: sourceFixtureId.toString(),
            source_competition_id: leagueId.toString(),
            source_event_name: `${homeTeam} vs ${awayTeam}`,
            fixture_id: dbFixture.id,
            competition_id: dbFixture.parent_league_id,
            source_id: this.sourceId,
        }).onConflict(["fixture_id", "source_id", "source_fixture_id"])
            .ignore()
            .returning("*");

        if (result.length > 0) {
            console.log(
                `✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`
            );
        } else {
            console.warn(
                `⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`
            );
        }
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

export default FetchCdBetwinnerFixturesService;