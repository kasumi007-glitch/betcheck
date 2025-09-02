import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi } from "../../../utils/HttpClientCG";
import Group from "../../../models/Group";
import Market from "../../../models/Market";
import { console } from "inspector";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchPlayongoOddsService {
    private readonly oddsApiUrlTemplate = "https://prod-api.velisports.com/sportsbookwebsitewebapi/WebSite/GetMatchById?MatchId={matchId}&CurrencyId=CDF&LanguageId=en&PartnerId=2&PartnerName=paridirect&TimeZone=3";
    private readonly sourceName = "CG_PLAYONGO";
    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    // Mapping from Playongo market types to our groups
    private readonly groupMapping: Record<string, string> = {
        "Match Result": "1X2",
        "Total Goals Over/Under": "Over / Under",
        "Both Teams To Score": "Both Teams to Score"
    };

    // Mapping from Playongo outcome names to our market names
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
        console.log("🚀 Fetching Playongo odds...");

        const sourceMatches = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select(
                "source_matches.source_fixture_id",
                "source_matches.fixture_id",
                "source_matches.source_event_name",
                "fixtures.date"
            )
            .whereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.is_active", true)
            .andWhere("source_matches.source_id", this.sourceId);

        for (const match of sourceMatches) {
            console.log(`🔍 Fetching odds for match: ${match.source_fixture_id}`);
            await this.fetchAndSaveOdds(match.source_event_name, match.source_fixture_id, match.fixture_id);
        }

        console.log("✅ Playongo odds synced successfully!");
    }

    private async fetchAndSaveOdds(sourceEventName: string, sourceFixtureId: string, fixtureId: number) {
        const apiUrl = this.oddsApiUrlTemplate.replace("{matchId}", sourceFixtureId);
        const response = await httpClientFromApi(apiUrl);

        if (!response?.Ms?.length) {
            console.warn(`⚠️ No odds found for match ${sourceFixtureId}`);
            return;
        }

        const filteredMarkets = response.Ms.filter((market: any) => this.groupMapping[market.N]);
        for (const market of filteredMarkets) {
            await this.processMarket(sourceEventName, market, fixtureId, sourceFixtureId);
        }
    }

    private async processMarket(sourceEventName: string, market: any, fixtureId: number, sourceFixtureId: string) {
        const marketName = market.N;
        if (!marketName || !this.groupMapping[marketName]) return;

        // Special handling for Over/Under - we only want 2.5 market
        if (marketName === "Total Goals Over/Under" && market.V !== "2.50") {
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

        for (const selection of market.Ss || []) {
            await this.processSelection(sourceEventName, groupName, selection, dbGroup.group_id, fixtureId, sourceFixtureId, outcomeMap);
        }
    }

    private async processSelection(
        sourceEventName: string,
        groupName: string,
        selection: any,
        groupId: number,
        fixtureId: number,
        sourceFixtureId: string,
        outcomeMap: Record<string, string>
    ) {
        let outcomeName = selection.N;
        if (!outcomeName) return;

        if (groupName === "1X2") {
            const [homeTeamName, awayTeamName] = sourceEventName.split(" vs ");
            const cleanDesc = outcomeName.trim();
            const cleanHome = homeTeamName.trim();
            const cleanAway = awayTeamName.trim();

            if (cleanDesc === cleanHome) outcomeName = "1";
            if (cleanDesc === cleanAway) outcomeName = "2";
        }

        const mappedName = outcomeMap[outcomeName.split(' ')[0]]; // Get first word (e.g., "Over" from "Over (2.5)")
        if (!mappedName) {
            console.warn(`❌ No mapping for outcome: ${outcomeName}`);
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

        const coefficient = Number(selection.C);
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

export default FetchPlayongoOddsService;