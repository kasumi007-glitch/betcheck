import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientAO";
import Group from "../../../models/Group";
import Market from "../../../models/Market";

class FetchEBetFixturesWithOddsService {
    private readonly fixturesApiUrlTemplate = "https://bitville-sports.bitville-api.com/sports/callback/events?page=1&tournament={tournamentId}&country={countryId}&time_slug=all&bsid=sr%3Asport%3A1&code=online-ebet-ao-sports";
    private readonly sourceName = "AO_EBET";
    private sourceId!: number;
    private fetchFixture!: boolean;
    private fetchOdd!: boolean;

    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];
    private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

    private readonly groupMapping: Record<string, string> = {
        "_0_1": "1X2",
        "_2_18-(25)": "Over / Under",
        "_5_29": "Both Teams to Score"
    };

    private readonly outcomeNameMapping: Record<string, Record<string, string>> = {
        "_0_1": { "1": "1", "2": "X", "3": "2" },
        "_2_18-(25)": { "12": "Over", "13": "Under" },
        "_5_29": { "74": "Yes", "76": "No" }
    };

    async initialize() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadTeamNameMappings();
        this.dbGroups = await db("groups");
        this.dbMarkets = await db("markets");
    }

    async syncFixtures(fetchFixture: boolean, fetchOdd: boolean = false) {
        await this.initialize();
        this.fetchFixture = fetchFixture;
        this.fetchOdd = fetchOdd;
        console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

        const sourceLeagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "source_league_matches.source_country_id",
                "leagues.external_id as league_external_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of sourceLeagues) {
            console.log(`🔍 Processing league: ${league.source_league_id}`);
            await this.processLeague(league);
        }

        console.log(`✅ Fixtures and odds synced successfully from ${this.sourceName}!`);
    }

    private async processLeague(league: any) {
        const apiUrl = this.fixturesApiUrlTemplate
            .replace("{tournamentId}", league.source_league_id)
            .replace("{countryId}", encodeURIComponent(league.source_country_id));

        const response = await fetchFromApiWithoutProxy(apiUrl, {
            headers: {
                "Cookie": "PHPSESSID=g0cf9ik60plpubg454fsscthob"
            }
        });

        if (!response) {
            console.warn(`⚠️ No data received for league ${league.source_league_id}`);
            return;
        }

        // for (const [marketKey, marketData] of Object.entries(response)) {
        //     const market = marketData as any;
        //     if (!market.matches) continue;

        //     for (const [matchId, match] of Object.entries(market.matches)) {
        //         if (this.fetchFixture) {
        //             await this.processFixture(match, league.league_external_id);
        //         }
        //         if (this.fetchOdd) {
        //             await this.processOdds(match, marketKey);
        //         }
        //     }
        // }

        // Process fixtures
        if (this.fetchFixture) {
            // Get all unique matches in one operation
            const allMatches = Object.values(response)
                .flatMap((market: any) =>
                    market.matches ? Object.values(market.matches) : []
                )
                .reduce((uniqueMatches: Map<string, any>, match: any) => {
                    const sourceFixtureId = match.match_id.toString();
                    if (!uniqueMatches.has(sourceFixtureId)) {
                        uniqueMatches.set(sourceFixtureId, match);
                    }
                    return uniqueMatches;
                }, new Map<string, any>());

            for (const match of allMatches.values()) {
                await this.processFixture(match, league.league_external_id);
            }
        }

        // Second pass: Process odds if needed
        if (this.fetchOdd) {
            // First filter to only the markets we care about
            const filteredMarkets = Object.entries(response)
                .filter(([marketKey]) => this.groupMapping[marketKey]); // Only keep markets in our mapping

            // Then process odds for filtered markets only
            for (const [marketKey, marketData] of filteredMarkets) {
                const market = marketData as any;
                if (!market.matches) continue;

                for (const [matchId, match] of Object.entries(market.matches)) {
                    await this.processOdds(match as any, marketKey);
                }
            }
        }
    }

    private async processFixture(match: any, leagueExternalId: number): Promise<boolean> {
        const sourceFixtureId = match.match_id.toString();
        const [homeTeam, awayTeam] = match.competitors;

        const leagueTeamMappings = this.teamNameMappings[leagueExternalId] || [];
        const mappedHomeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeam)?.name ?? homeTeam;
        const mappedAwayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeam)?.name ?? awayTeam;

        const eventDate = new Date(match.date);
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
            .andWhere("leagues.external_id", leagueExternalId)
            .first();

        if (!matchedFixture) {
            console.warn(
                `⚠️ No match found for fixture: ${mappedHomeTeam} vs ${mappedAwayTeam} in league ${leagueExternalId}`
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
                `✅ Inserted match: ${mappedHomeTeam} vs ${mappedAwayTeam} (Fixture ID: ${matchedFixture.id})`
            );
        } else {
            console.warn(
                `⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
            );
        }

        return result.length > 0;
    }

    private async processOdds(match: any, marketKey: string): Promise<void> {
        const sourceFixtureId = match.match_id.toString();
        const sourceMatch = await db("source_matches")
            .where("source_fixture_id", sourceFixtureId)
            .andWhere("source_id", this.sourceId)
            .first();

        if (!sourceMatch) return;
        const internalFixtureId = sourceMatch.fixture_id;

        console.log(`🔍 Processing odds for match: ${sourceMatch.source_event_name} in market: ${marketKey}`);

        const groupName = this.groupMapping[marketKey];
        if (!groupName) return;

        const dbGroup = this.dbGroups.find(g => g.group_name === groupName);
        if (!dbGroup) return;

        const outcomeMap = this.outcomeNameMapping[marketKey];
        if (!outcomeMap) return;

        for (const [oddsKey, oddsData] of Object.entries(match.odds)) {
            await this.processOutcome(oddsData, outcomeMap, dbGroup, internalFixtureId, sourceFixtureId);
        }
    }

    private async processOutcome(
        oddsData: any,
        outcomeMap: Record<string, string>,
        dbGroup: Group,
        fixtureId: number,
        sourceFixtureId: string
    ): Promise<void> {
        const outcomeName = outcomeMap[oddsData.outcome_id];
        if (!outcomeName) return;

        const dbMarket = this.dbMarkets.find(
            m => m.market_name.toLowerCase() === outcomeName.toLowerCase() &&
                m.group_id === dbGroup.group_id
        );
        if (!dbMarket) return;

        const coefficient = parseFloat(oddsData.odd);
        if (isNaN(coefficient)) return;

        await this.saveMarketOutcome(
            dbGroup.group_id,
            coefficient,
            dbMarket.market_id,
            fixtureId,
            sourceFixtureId
        );
    }

    private async saveMarketOutcome(
        groupId: number,
        coefficient: number,
        marketId: number,
        fixtureId: number,
        externalSourceFixtureId: string
    ) {
        await db("fixture_odds")
            .insert({
                group_id: groupId,
                market_id: marketId,
                coefficient,
                fixture_id: fixtureId,
                external_source_fixture_id: externalSourceFixtureId,
                source_id: this.sourceId,
            })
            .onConflict([
                "group_id",
                "market_id",
                "fixture_id",
                "external_source_fixture_id",
                "source_id",
            ])
            .merge({
                coefficient: db.raw("EXCLUDED.coefficient"),
                updated_at: db.fn.now(),
            });

        console.log(`✅ Odds saved: ${groupId}-${marketId} @ ${coefficient}`);
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
        }, {} as Record<number, { name: string; mapped_name: string }[]>);
    }
}

export default FetchEBetFixturesWithOddsService;