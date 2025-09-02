import { db } from "../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../utils/HttpClientCI";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { OddsSnapshotService } from "../../utils/OddsSnapshotService";

class FetchAkwaBetOddsService {
    private readonly oddsApiUrl = "https://sports-apipro.logiqsport.com/api/Pregame/GetEvent?lang=en&siteid=43";
    private readonly sourceName = "AKWABET";
    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    // Mapping from AkwaBet market types to our groups
    private readonly groupMapping: Record<string, string> = {
        "Match Result": "1X2",
        "Total Goals (2.5)": "Over / Under",
        "Both Teams To Score": "Both Teams to Score"
    };

    // Mapping from AkwaBet outcome names to our market names
    private readonly outcomeNameMapping: Record<string, Record<string, string>> = {
        "1X2": {
            "W1": "1",
            "Draw": "X",
            "W2": "2"
        },
        "Over / Under": {
            "Over (2.5)": "Over",
            "Under (2.5)": "Under"
        },
        "Both Teams to Score": {
            "Yes": "Yes",
            "No": "No"
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
        console.log("🚀 Fetching AkwaBet odds...");

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

        for (const match of sourceMatches) {
            await this.fetchAndSaveOdds(match.source_fixture_id, match.fixture_id);
        }

        console.log("✅ AkwaBet odds synced successfully!");
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, fixtureId: number) {
        const requestData = {
            ProviderId: 1,
            Value: sourceFixtureId,
            H24: "false"
        };

        const response = await fetchFromApiWithoutProxy(this.oddsApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { data: JSON.stringify(requestData) }
        });

        const markets = response?.Contents?.Markets || [];
        if (!markets.length) return;

        const filteredMarkets = (markets ?? []).filter((market: any) => this.groupMapping[market.MarketName?.International]);
        for (const market of filteredMarkets) {
            await this.processMarket(market, fixtureId, sourceFixtureId);
        }
    }

    private async processMarket(market: any, fixtureId: number, sourceFixtureId: string) {
        const marketName = market.MarketName?.International;
        if (!marketName || !this.groupMapping[marketName]) return;

        // Special handling for Over/Under - we only want 2.5 market
        if (marketName !== "Total Goals (2.5)" && this.groupMapping[marketName] === "Over / Under") {
            return;
        }

        const groupName = this.groupMapping[marketName];
        const dbGroup = this.dbGroups.find(g => g.group_name === groupName);
        if (!dbGroup) {
            console.warn(`❌ No DB Group found for: ${groupName}`);
            return;
        }

        const outcomeMap = this.outcomeNameMapping[groupName];
        if (!outcomeMap) {
            console.warn(`❌ No outcome mapping defined for market: ${marketName}`);
            return;
        }

        for (const field of market.MarketFields || []) {
            await this.processField(field, dbGroup.group_id, fixtureId, sourceFixtureId, outcomeMap);
        }
    }

    private async processField(
        field: any,
        groupId: number,
        fixtureId: number,
        sourceFixtureId: string,
        outcomeMap: Record<string, string>
    ) {
        const fieldName = field.FieldName?.International;
        if (!fieldName) return;

        const mappedName = outcomeMap[fieldName];
        if (!mappedName) {
            console.warn(`❌ No mapping for field: ${fieldName}`);
            return;
        }

        const dbMarket = this.dbMarkets.find(m =>
            m.market_name === mappedName &&
            m.group_id === groupId
        );
        if (!dbMarket) {
            console.warn(`❌ No DB market found for selection: ${mappedName}`);
            return;
        }

        const coefficient = Number(field.Value);
        if (isNaN(coefficient)) return;

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

export default FetchAkwaBetOddsService;