import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../../utils/HttpClientCM";
import Group from "../../../models/Group";
import Market from "../../../models/Market";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchCmBettomaxOddsService {
    private readonly oddsApiUrl = "https://sportapis-bettomax.webapis.sk/SportsOfferApi/api/sport/offer/v3/match/offers";
    private readonly sourceName = "CM_BETTOMAX";
    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    // Mapping from Bettomax market types to our groups
    private readonly groupMapping: Record<string, string> = {
        "Basic Offer": "1X2",
        "Total goals [2.5]": "Over / Under",
        "Both teams to score": "Both Teams to Score"
    };

    // Mapping from Bettomax outcome names to our market names
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
        console.log("🚀 Fetching Bettomax odds...");

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

        console.log("✅ Bettomax odds synced successfully!");
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, fixtureId: number) {
        const url = `${this.oddsApiUrl}?MatchId=${sourceFixtureId}`;

        const response = await httpClientFromApi(url, {
            headers: {
                'languageid': 'en',
                'Origin': 'https://bettomax.cm',
                'Referer': 'https://bettomax.cm/'
            }
        });

        const offers = response?.Offers || [];
        if (!offers.length) return;

        const filteredOffers = offers.filter((offer: any) => {
            // For Over/Under, we only want the 2.5 market
            if (offer.BetTypeKey === "60") {
                return offer.Sbv === "2.5";
            }
            return ["1", "43"].includes(offer.BetTypeKey);
        });

        for (const offer of filteredOffers) {
            await this.processOffer(offer, fixtureId, sourceFixtureId);
        }
    }

    private async processOffer(offer: any, fixtureId: number, sourceFixtureId: string) {
        let groupName: string | null = null;

        if (offer.BetTypeKey === "1") {
            groupName = "1X2";
        } else if (offer.BetTypeKey === "60" && offer.Sbv === "2.5") {
            groupName = "Over / Under";
        } else if (offer.BetTypeKey === "43") {
            groupName = "Both Teams to Score";
        }

        if (!groupName) return;

        const dbGroup = this.dbGroups.find(g => g.group_name === groupName);
        if (!dbGroup) {
            console.warn(`❌ No DB Group found for: ${groupName}`);
            return;
        }

        const outcomeMap = this.outcomeNameMapping[groupName];
        if (!outcomeMap) {
            console.warn(`❌ No outcome mapping defined for group: ${groupName}`);
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
        const oddName = odd.Name;
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

export default FetchCmBettomaxOddsService;