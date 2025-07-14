import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi } from "../../../utils/HttpClientCG";
import { format } from 'date-fns';

class FetchPlayongoFixturesService {
    private readonly fixturesApiUrl = "https://prod-api.velisports.com/sportsbookwebsitewebapi/WebSite/GetMatchesByCompetitions";
    private readonly sourceName = "CG_PLAYONGO";
    private sourceId!: number;
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadTeamNameMappings();
    }

    async syncFixtures() {
        await this.init();
        console.log("🚀 Fetching Playongo fixtures...");

        const sourceLeagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "source_league_matches.source_country_id",
                "leagues.external_id as league_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of sourceLeagues) {
            const requestData = {
                competitionIds: [parseInt(league.source_league_id)],
                matchType: 1,
                withLive: true,
                currencyId: "CDF",
                languageId: "en",
                partnerId: 2,
                partnerName: "paridirect",
                timeZone: 3
            };

            const response = await httpClientFromApi(this.fixturesApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data: requestData
            });

            const matches = response?.Ms || [];
            if (!matches.length) {
                console.warn(`⚠️ No matches found for league ${league.source_league_id}`);
                continue;
            }

            for (const match of matches) {
                await this.processFixture(match, league.league_id);
            }
        }

        console.log("✅ Playongo fixtures synced successfully!");
    }

    private async processFixture(match: any, leagueId: number): Promise<boolean> {
        const sourceFixtureId = match.MI.toString();
        const homeTeam = match.Cs?.find((t: any) => t.O === 1)?.TN || "";
        const awayTeam = match.Cs?.find((t: any) => t.O === 2)?.TN || "";

        if (!homeTeam || !awayTeam) return false;

        const leagueTeamMappings = this.teamNameMappings[leagueId] || [];
        const mappedHomeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeam)?.name ?? homeTeam;
        const mappedAwayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeam)?.name ?? awayTeam;

        const eventDate = new Date(match.ST);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (eventDate < today) {
            console.log(`🗓️ Skipping past fixture: ${mappedHomeTeam} vs ${mappedAwayTeam}`);
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
                [`%${mappedHomeTeam}%`, `%${mappedAwayTeam}%`]
            )
            .andWhereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.external_id", leagueId)
            .first();

        if (!matchedFixture) {
            console.warn(
                `⚠️ No match found for fixture: ${mappedHomeTeam} vs ${mappedAwayTeam} in league ${leagueId}`
            );
            return false;
        }

        const result = await db("source_matches")
            .insert({
                source_fixture_id: sourceFixtureId,
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
            console.log(`✅ Inserted match: ${mappedHomeTeam} vs ${mappedAwayTeam} (Fixture ID: ${matchedFixture.id})`);
        } else {
            console.warn(`⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`);
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

export default FetchPlayongoFixturesService;