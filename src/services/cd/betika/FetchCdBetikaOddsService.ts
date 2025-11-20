import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchCdBetikaOddsService {
    private readonly apiUrl = "https://api-cd.betika.com/v1/uo/match";
    private readonly sourceName = "CD_BETIKA";
    private sourceId!: number;
    private dbGroups: any[] = [];
    private dbMarkets: any[] = [];

    // Define market group mappings based on sub_type_id
    private readonly groupMapping: Record<string, string> = {
        "1": "1X2",
        "29": "Both Teams to Score",
        "18": "Over / Under"
    };

    // Define market name mappings
    private readonly marketMapping: Record<string, Record<string, string>> = {
        "1X2": {
            "1": "1",
            "X": "X",
            "2": "2"
        },
        "Both Teams to Score": {
            "OUI": "Yes",
            "NON": "No"
        },
        "Over / Under": {
            "PLUS DE 2.5": "Over",
            "MOINS DE 2.5": "Under"
        }
    };

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        this.dbGroups = await db("groups");
        this.dbMarkets = await db("markets");
    }

    async syncOdds() {
        await this.init();
        console.log(`🚀 Fetching odds from ${this.sourceName}...`);

        const fixtures = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select("source_matches.source_fixture_id", "fixtures.id as fixture_id")
            .whereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.is_active", true)
            .andWhere("source_matches.source_id", this.sourceId);

        for (const match of fixtures) {
            await this.fetchOdds(match.source_fixture_id, match.fixture_id);
        }

        console.log(`✅ Odds synced successfully from ${this.sourceName}!`);
    }

    private async fetchOdds(sourceFixtureId: string, fixtureId: number) {
        try {
            const url = `${this.apiUrl}?parent_match_id=${sourceFixtureId}`;
            const response = await fetchFromApiWithoutProxy(url);
            await this.processOddsResponse(response, fixtureId, sourceFixtureId);
        } catch (error) {
            console.error(`❌ Error fetching odds for fixture ${sourceFixtureId}:`, error instanceof Error ? error.message : error);
        }
    }

    private async processOddsResponse(response: any, fixtureId: number, sourceFixtureId: string) {
        const markets = response?.data || [];

        // Filter only the necessary groups (1X2, Both Teams to Score, Over/Under 2.5)
        const filteredGroups = markets.filter((market: any) =>
            this.groupMapping[market.sub_type_id] &&
            (market.sub_type_id !== "18" || this.hasTotal25Market(market))
        );

        for (const group of filteredGroups) {
            const groupName = this.groupMapping[group.sub_type_id];
            const dbGroup = this.dbGroups.find(g => g.group_name === groupName);
            if (!dbGroup) continue;

            for (const odd of group.odds) {
                const marketName = this.marketMapping[groupName][odd.display];
                if (!marketName) continue;

                // For Over/Under, only process total=2.5 markets
                if (groupName === "Over / Under" && odd.special_bet_value !== "total=2.5") {
                    continue;
                }

                const dbMarket = this.dbMarkets.find(m =>
                    m.group_id === dbGroup.group_id &&
                    m.market_name === marketName
                );
                if (!dbMarket) continue;

                const coefficient = parseFloat(odd.odd_value || "0");
                if (isNaN(coefficient)) {
                    console.warn(`Invalid coefficient for ${groupName} market: ${odd.odd_value}`);
                    continue;
                }

                await OddsSnapshotService.saveOrUpdate({
                    group_id: dbGroup.group_id,
                    market_id: dbMarket.market_id,
                    fixture_id: fixtureId,
                    source_id: this.sourceId,
                    external_source_fixture_id: sourceFixtureId,
                    coefficient,
                });
            }
        }
    }

    private hasTotal25Market(market: any): boolean {
        return market.odds.some((odd: any) => odd.special_bet_value === "total=2.5");
    }
}

export default FetchCdBetikaOddsService;