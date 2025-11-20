import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";
import Group from "../../../models/Group";
import Market from "../../../models/Market";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchCdWinnerBetOddsService {
    private readonly oddsApiUrl = "https://winner.bet/services/evapi/event/GetEvents?eventIds=";
    private readonly sourceName = "CD_WINNERBET";
    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    // Mapping from CD Winner Bet market types to our groups
    private readonly groupMapping: Record<string, string> = {
        "FT 1X2": "1X2",
        "Under/Over": "Over / Under",
        "GG/NG": "Both Teams to Score"
    };

    // Mapping from CD Winner Bet outcome names to our market names
    private readonly outcomeNameMapping: Record<string, Record<string, string>> = {
        "1X2": {
            "1": "1",
            "X": "X",
            "2": "2"
        },
        "Over / Under": {
            "Over": "Over",
            "Under": "Under"
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
        console.log("🚀 Fetching CD Winner Bet odds...");

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

        console.log("✅ CD Winner Bet odds synced successfully!");
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, fixtureId: number) {
        const url = `${this.oddsApiUrl}${sourceFixtureId}`;
        const response = await httpClientFromApi(url);

        const event = response?.data?.[0];
        if (!event) return;

        const markets = event.bts || [];
        if (!markets.length) return;

        const filteredMarkets = markets.filter((market: any) => this.groupMapping[market.n]);
        for (const market of filteredMarkets) {
            await this.processMarket(market, fixtureId, sourceFixtureId);
        }
    }

    private async processMarket(market: any, fixtureId: number, sourceFixtureId: string) {
        const marketName = market.n;
        if (!marketName || !this.groupMapping[marketName]) return;

        // Special handling for Over/Under - we only want 2.5 market
        if (marketName === "Under/Over") {
            const has25Market = market.odds.some((odd: any) => odd.l === "2.5");
            if (!has25Market) return;
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

        for (const odd of market.odds || []) {
            // For Over/Under, only process if it's 2.5
            if (marketName === "Under/Over" && odd.l !== "2.5") continue;

            await this.processOdd(odd, dbGroup.group_id, fixtureId, sourceFixtureId, outcomeMap);
        }
    }

    private async processOdd(
        odd: any,
        groupId: number,
        fixtureId: number,
        sourceFixtureId: string,
        outcomeMap: Record<string, string>
    ) {
        const oddName = odd.id;
        if (!oddName) return;

        const mappedName = outcomeMap[oddName];
        if (!mappedName) {
            console.warn(`❌ No mapping for odd: ${oddName}`);
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

        const coefficient = Number(odd.p);
        if (isNaN(coefficient)) return;

        await OddsSnapshotService.saveOrUpdate({
            group_id: groupId,
            market_id: dbMarket.market_id,
            fixture_id: fixtureId,
            source_id: this.sourceId,
            external_source_fixture_id: sourceFixtureId,
            coefficient,
        });

        // await db("fixture_odds").insert({
        //     group_id: groupId,
        //     market_id: dbMarket.market_id,
        //     coefficient,
        //     fixture_id: fixtureId,
        //     external_source_fixture_id: sourceFixtureId,
        //     source_id: this.sourceId,
        // }).onConflict([
        //     "group_id",
        //     "market_id",
        //     "fixture_id",
        //     "external_source_fixture_id",
        //     "source_id",
        // ])
        //     .merge({
        //         coefficient: db.raw("EXCLUDED.coefficient"),
        //         updated_at: db.fn.now(),
        //     });

        // console.log(`✅ Odds updated: ${groupId}/${dbMarket.market_id} @ ${coefficient}`);
    }
}

export default FetchCdWinnerBetOddsService;