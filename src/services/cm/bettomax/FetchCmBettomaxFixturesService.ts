import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../../utils/HttpClientCM";

class FetchCmBettomaxFixturesService {
    private readonly fixturesApiUrl = "https://sportapis-bettomax.webapis.sk/SportsOfferApi/api/sport/offer/v3/sports/offer";
    private readonly sourceName = "CM_BETTOMAX";
    private sourceId!: number;
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadTeamNameMappings();
    }

    async syncFixtures() {
        await this.init();
        console.log("🚀 Fetching Bettomax fixtures...");

        const sourceLeagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "source_league_matches.source_country_id",
                "leagues.external_id as league_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateFrom = today.toISOString();

        for (const league of sourceLeagues) {
            const url = new URL(this.fixturesApiUrl);
            url.searchParams.append("Offset", "0");
            url.searchParams.append("Limit", "50");
            url.searchParams.append("DateFrom", dateFrom);
            url.searchParams.append("SportIds", "388"); // Soccer ID
            url.searchParams.append("CategoryIds", league.source_country_id);
            url.searchParams.append("LeagueIds", league.source_league_id);
            url.searchParams.append("DateTo", "2033-09-29T21:00:00.060Z");
            url.searchParams.append("BetTypeKey", "3");

            const response = await httpClientFromApi(url.toString(), {
                headers: {
                    'languageid': 'en',
                    'Origin': 'https://bettomax.cm',
                    'Referer': 'https://bettomax.cm/'
                }
            });

            const matches = response?.Response?.[0]?.Categories?.[0]?.Leagues?.[0]?.Matches || [];
            if (!matches.length) {
                console.warn(`⚠️ No events found for league: ${league.source_league_id}`);
                continue;
            }

            for (const match of matches || []) {
                await this.processFixture(match, league.league_id);
            }
        }

        console.log("✅ Bettomax fixtures synced successfully!");
    }

    private async processFixture(match: any, leagueId: number): Promise<boolean> {
        const sourceFixtureId = match.Id;
        const homeTeamName = match.TeamHome;
        const awayTeamName = match.TeamAway;

        const leagueTeamMappings = this.teamNameMappings[leagueId] || [];
        const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
        const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

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

export default FetchCmBettomaxFixturesService;