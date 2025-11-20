import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientSN";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchSnMojabetOddsService {
    private readonly oddsApiUrlTemplate = "https://mojabet.sn/api/Football/events/{eventId}/popular/odds";
    private readonly sourceName = "SN_MOJABET";
    private sourceId!: number;
    private dbGroups: any[] = [];
    private dbMarkets: any[] = [];

    // Define market group mappings
    private readonly groupMapping: Record<string, string> = {
        "Full-time result": "1X2",
        "Total": "Over / Under",
        "Both teams to score": "Both Teams to Score"
    };

    // Define market name mappings
    private readonly marketMapping: Record<string, Record<string, string>> = {
        "1X2": {
            "1": "1",
            "X": "X",
            "2": "2"
        },
        "Both Teams to Score": {
            "Yes": "Yes",
            "No": "No"
        },
        "Over / Under": {
            "Over 2.5": "Over",
            "Under 2.5": "Under"
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
        console.log("🚀 Fetching SN Mojabet odds...");

        const sourceMatches = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select(
                "source_matches.source_fixture_id",
                "source_matches.fixture_id",
                "fixtures.date"
            )
            .whereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.is_active", true)
            .andWhere("source_matches.source_id", this.sourceId);

        console.log(`Found ${sourceMatches.length} fixtures to process`);

        for (const match of sourceMatches) {
            await this.fetchAndSaveOdds(match.source_fixture_id, match.fixture_id);
        }

        console.log("✅ SN Mojabet odds synced successfully!");
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, fixtureId: number) {
        const apiUrl = this.oddsApiUrlTemplate.replace("{eventId}", sourceFixtureId);

        try {
            const response = await fetchFromApiWithoutProxy(apiUrl, {
                headers: {
                    "Cookie": "ISO2=SEN; ISO3=XOF; XRegion=SEN; currencyId=99; defaultLanguage=fr-SN; language=en-SN; theme-key=Light-blue"
                }
            });

            if (!response?.markets) return;

            const filteredMarkets = response.markets.filter((market: any) =>
                this.groupMapping[market.translation]
            );

            for (const market of filteredMarkets) {
                await this.processMarket(market, fixtureId, sourceFixtureId);
            }
        } catch (error) {
            console.error(`Error fetching odds for fixture ${sourceFixtureId}:`, error);
        }
    }

    private async processMarket(market: any, fixtureId: number, sourceFixtureId: string) {
        const marketName = market.translation;
        const groupName = this.groupMapping[marketName];

        if (!groupName) return;

        const dbGroup = this.dbGroups.find(g => g.group_name === groupName);
        if (!dbGroup) {
            console.warn(`❌ No DB Group found for: ${groupName}`);
            return;
        }

        // Special handling for Over/Under - only process 2.5 market
        if (groupName === "Over / Under") {
            const items25 = market.items.filter((item: any) =>
                item.sortValue === 2.5
            );

            if (items25.length === 0) return;

            for (const item of items25) {
                await this.processMarketItem(item, dbGroup.group_id, fixtureId, sourceFixtureId, groupName);
            }
        } else {
            for (const item of market.items) {
                await this.processMarketItem(item, dbGroup.group_id, fixtureId, sourceFixtureId, groupName);
            }
        }
    }

    private async processMarketItem(item: any, groupId: number, fixtureId: number, sourceFixtureId: string, groupName: string) {
        for (const outcome of item.outcomes || []) {
            await this.processOutcome(outcome, groupId, fixtureId, sourceFixtureId, groupName);
        }
    }

    private async processOutcome(outcome: any, groupId: number, fixtureId: number, sourceFixtureId: string, groupName: string) {
        const outcomeName = outcome.translation;
        if (!outcomeName) return;

        // Use the mapping object to get the market name
        const marketName = this.marketMapping[groupName]?.[outcomeName];
        if (!marketName) {
            console.warn(`❌ No mapping found for outcome: ${outcomeName} in group: ${groupName}`);
            return;
        }

        const dbMarket = this.dbMarkets.find(m =>
            m.group_id === groupId &&
            m.market_name === marketName
        );

        if (!dbMarket) {
            console.warn(`❌ No DB market found for: ${marketName} in group ${groupId}`);
            return;
        }

        const coefficient = Number(outcome.odds);
        if (isNaN(coefficient)) {
            console.warn(`❌ Invalid coefficient: ${outcome.odds}`);
            return;
        }

        await OddsSnapshotService.saveOrUpdate({
            group_id: groupId,
            market_id: dbMarket.market_id,
            fixture_id: fixtureId,
            source_id: this.sourceId,
            external_source_fixture_id: sourceFixtureId,
            coefficient,
        });
    }
}

export default FetchSnMojabetOddsService;