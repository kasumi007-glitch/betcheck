import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCG";
import Group from "../../../models/Group";
import Market from "../../../models/Market";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchApolloGamesOddsService {
    private readonly oddsApiUrl = "https://sportapis-apollo.webapis.sk/SportsOfferApi/api/sport/offer/v3/match/offers?MatchId={matchId}";
    private readonly sourceName = "CG_APOLLOGAMES";
    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    // Mapping from ApolloGames market types to our groups
    private readonly groupMapping: Record<string, string> = {
        "Basic Offer": "1X2",
        "Total goals [2.5]": "Over / Under",
        "Both teams to score": "Both Teams to Score"
    };

    // Mapping from ApolloGames outcome names to our market names
    private readonly outcomeNameMapping: Record<string, Record<string, string>> = {
        "1X2": {
            "1": "1",
            "X": "X",
            "2": "2"
        },
        "Over / Under": {
            "Under": "Under",
            "Over": "Over"
        },
        "Both Teams to Score": {
            "yes": "Yes",
            "no": "No"
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
        console.log("🚀 Fetching ApolloGames odds...");

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
            console.log(`🔍 Fetching odds for match: ${match.source_fixture_id}`);
            await this.fetchAndSaveOdds(match.source_fixture_id, match.fixture_id);
        }

        console.log("✅ ApolloGames odds synced successfully!");
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, fixtureId: number) {
        const apiUrl = this.oddsApiUrl.replace("{matchId}", sourceFixtureId);
        const response = await fetchFromApiWithoutProxy(apiUrl);

        if (!response?.Offers?.length) {
            console.warn(`⚠️ No odds found for match ${sourceFixtureId}`);
            return;
        }

        const filteredMarkets = response.Offers.filter((market: any) => this.groupMapping[market.Description]);
        for (const offer of filteredMarkets) {
            await this.processOffer(offer, fixtureId, sourceFixtureId);
        }
    }

    private async processOffer(offer: any, fixtureId: number, sourceFixtureId: string) {
        const marketName = offer.Description;
        if (!marketName || !this.groupMapping[marketName]) return;

        // Special handling for Over/Under - we only want 2.5 market
        if (marketName !== "Total goals [2.5]" && this.groupMapping[marketName] === "Over / Under") {
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

        for (const odd of offer.Odds || []) {
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
        const outcomeName = odd.Name;
        if (!outcomeName) return;

        const mappedName = outcomeMap[outcomeName];
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

        const coefficient = Number(odd.Odd);
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

export default FetchApolloGamesOddsService;