import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";
import Group from "../../../models/Group";
import Market from "../../../models/Market";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchCdBetwinnerOddsService {
    private readonly oddsApiUrlTemplate = "https://betwinner1.com/service-api/LineFeed/GetGameZip?id={fixtureId}&lng=en&isSubGames=true&GroupEvents=true&countevents=250&grMode=4&partner=152&topGroups=&country=213&marketType=1";
    private readonly sourceName = "CD_BETWINNER";
    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    // Mapping of 1xBet market groups to our system
    private readonly groupMapping: Record<number, string> = {
        1: "1X2",          // Main market
        17: "Over / Under",
        19: "Both Teams to Score"
    };

    // Mapping of 1xBet outcome types to our system
    private readonly outcomeMapping: Record<number, string> = {
        1: "1",
        2: "X",
        3: "2",
        9: "Over",
        10: "Under",
        180: "Yes",
        181: "No",
    };

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        this.dbGroups = await db("groups");
        this.dbMarkets = await db("markets");
    }

    async syncOdds() {
        await this.init();
        const fixtures = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select(
                "source_matches.source_fixture_id",
                "fixtures.id",
                "fixtures.date"
            )
            .whereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.is_active", true)
            .andWhere("source_matches.source_id", this.sourceId);

        for (const match of fixtures) {
            await this.fetchAndSaveOdds(match.source_fixture_id, match.id);
        }

        console.log("✅ Betwinner odds synced successfully!");
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, fixtureId: number) {
        const apiUrl = this.oddsApiUrlTemplate.replace("{fixtureId}", sourceFixtureId);
        const response = await fetchFromApiWithoutProxy(apiUrl);

        if (!response?.Success || !response.Value?.GE) return;

        for (const groupEvent of response.Value.GE) {
            const groupName = this.groupMapping[groupEvent.G];
            if (!groupName) continue;

            const dbGroup = this.dbGroups.find(g => g.group_name.toLowerCase() === groupName.toLowerCase());
            if (!dbGroup) continue;

            for (const eventArray of groupEvent.E) {
                for (const event of eventArray) {
                    await this.saveOutcome(dbGroup.group_id, fixtureId, sourceFixtureId, event, groupName);
                }
            }
        }
    }

    private async saveOutcome(groupId: number, fixtureId: number, sourceFixtureId: string, event: any, groupName: string) {
        const outcomeType = this.outcomeMapping[event.T];
        if (!outcomeType) return;

        let marketName = outcomeType;

        if (groupName === "Over / Under" && event.P !== Number("2.5")) {
            // Skip if the name is "Over" or "Under" and the handicap is not "2.5"
            return;
        }

        const dbMarket = this.dbMarkets.find(m =>
            m.market_name.toLowerCase() === marketName.toLowerCase() &&
            m.group_id === groupId
        );

        if (!dbMarket) return;

        const coefficient = parseFloat(event.C);
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

export default FetchCdBetwinnerOddsService;