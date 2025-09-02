import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi as httpClientCI } from "../../../utils/HttpClientCI";
import { httpClientFromApi as httpClientSN } from "../../../utils/HttpClientSN";
import { httpClientFromApi as httpClientBJ } from "../../../utils/HttpClientBJ";

class FetchCiBetclicFixturesService {
    // private readonly baseUrl = "https://www.betclic.ci/football-sfootball";
    // private readonly sourceName = "CI_BETCLIC";
    private sourceId!: number;
    private httpClient!: (url: string) => Promise<any>;
    private apiUrlTemplate!: string;
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    async initialize(sourceName: string) {
        switch (sourceName.toUpperCase()) {
            case "CI_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.ci/football-sfootball";
                this.httpClient = httpClientCI;
                break;

            case "SN_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.sn/football-sfootball";
                this.httpClient = httpClientSN;
                break;

            case "BJ_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.bj/football-sfootball";
                this.httpClient = httpClientBJ;
                break;

            default:
                throw new Error(`Unknown source: ${sourceName}`);
        }

        const source = await db("sources").where("name", sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({ name: sourceName })
                .returning("id");
        } else {
            this.sourceId = source.id;
        }

        await this.loadTeamNameMappings();
    }

    private async getSourceLeagues(): Promise<{ source_league_id: string; league_external_id: number; competitionName: string }[]> {
        return await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "source_league_matches.source_league_name as competitionName",
                "leagues.external_id as league_external_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);
    }

    async syncFixtures(sourceName: string) {
        await this.initialize(sourceName);
        console.log(`🚀 Fetching fixtures from ${sourceName}...`);

        const sourceLeagues = await this.getSourceLeagues();
        if (!sourceLeagues.length) {
            console.warn("⚠️ No source leagues found for CI_BETCLIC.");
            return;
        }

        for (const league of sourceLeagues) {
            const leagueSlug = this.createLeagueSlug(league.competitionName, league.source_league_id);
            const url = `${this.apiUrlTemplate}/${leagueSlug}`;

            try {
                const response = await this.httpClient(url);
                const ngState = this.extractNgState(response);
                if (!ngState) continue;

                const matches = ngState?.payload?.matches ?? [];
                if (!matches.length) {
                    console.warn(`⚠️ No matches found for league: ${league.source_league_id}`);
                    continue;
                }

                for (const match of matches) {
                    if (!match.matchId) continue;
                    await this.processFixture(match, league);
                }
            } catch (error) {
                console.error(`❌ Error fetching fixtures for league ${league.source_league_id}:`, error);
            }
        }

        console.log(`✅ Fixtures synced successfully from ${sourceName}!`);
    }

    private createLeagueSlug(competitionName: string, competitionId: string): string {
        // Convert "Angl. Championship" to "angl-championship-c28"
        return competitionName
            .toLowerCase()
            .replace(/\./g, "")
            .replace(/\s+/g, "-")
            .replace(/--/g, "-") + `-c${competitionId}`;
    }

    private extractNgState(response: string): any {
        const ngStateRegex = /<script id="ng-state" type="application\/json">({.+?})<\/script>/;
        const match = response.match(ngStateRegex);
        if (!match) return null;

        try {
            const json = JSON.parse(match[1]);
            // Find the grpc response that contains matches data
            for (const key in json) {
                if (json[key]?.response?.payload?.matches) {
                    return json[key].response;
                }
            }
            return null;
        } catch (error) {
            console.error("Error parsing ng-state JSON:", error);
            return null;
        }
    }

    private async processFixture(match: any, league: any): Promise<boolean> {
        const sourceFixtureId = match.matchId;
        const sourceEventName = match.name;
        const homeTeamName = match.contestants?.[0]?.name?.trim() || "";
        const awayTeamName = match.contestants?.[1]?.name?.trim() || "";

        const leagueTeamMappings = this.teamNameMappings[league.league_external_id] || [];
        const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamName)?.name ?? homeTeamName;
        const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamName)?.name ?? awayTeamName;

        const matchDate = new Date(match.matchDateUtc);
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
            .andWhere("leagues.external_id", league.league_external_id)
            .first();

        if (!matchedFixture) {
            console.warn(
                `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${league.league_external_id}`
            );
            return false;
        }

        const result = await db("source_matches")
            .insert({
                source_fixture_id: sourceFixtureId,
                source_competition_id: league.source_league_id,
                source_competition_name: league.competitionName,
                source_event_name: sourceEventName,
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

export default FetchCiBetclicFixturesService;