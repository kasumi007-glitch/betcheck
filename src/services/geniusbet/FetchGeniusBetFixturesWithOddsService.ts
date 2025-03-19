import {db} from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import Group from "../../models/Group";
import {fetchFromApi} from "../../utils/ApiClientWithPost";
import {teamNameMappings} from "../teamNameMappings";

class FetchGeniusBetFixturesWithOddsService {
    private readonly apiUrlTemplate =
        "https://api.geniusbet.com.gn/api/v2/get-tournament-events-refactor";
    private readonly sourceName = "GeniusBet";
    private sourceId!: number;
    private fetchFixture!: boolean;
    private fetchOdd!: boolean;

    // 1) Market ID → Market Name
    private readonly groupMapping: Record<number, string> = {
        10: "1X2",
        430: "Over / Under",
        434: "Both Teams to Score", // Labelled as "GG/NG"
    };

    // 2) Market Name → Group Name
    private readonly marketGroupMapping: Record<string, string> = {
        "1X2": "Main",
        "Over / Under": "Main",
        "Both Teams to Score": "Main",
    };

    // 3) Outcome Name Mapping
    private readonly outcomeNameNewMapping: Record<string, string> = {
        "1": "1",
        "X": "X",
        "2": "2",
        "Over": "Over",
        "Under": "Under",
        "GG": "Yes",
        "NG": "No",
    };

    private dbMarkets: Market[] = [];
    private dbGroups: Group[] = [];

    async initialize() {
        const source = await db("sources").where("name", this.sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({name: this.sourceName})
                .returning("id");
        } else {
            this.sourceId = source.id;
        }

        this.dbMarkets = await this.getMarkets();
        this.dbGroups = await this.getGroups();
    }

    async syncFixtures(fetchFixture: boolean, fetchOdd: boolean = false) {
        await this.initialize();
        this.fetchFixture = fetchFixture;
        this.fetchOdd = fetchOdd;

        console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

        // Fetch active leagues linked to GeniusBet
        const leagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "leagues.external_id as league_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of leagues) {
            await this.fetchAndProcessFixtures(
                league.source_league_id,
                league.league_id
            );
        }

        console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
    }

    private async fetchAndProcessFixtures(
        sourceLeagueId: string,
        leagueId: number
    ) {
        const apiUrl = this.apiUrlTemplate.replace(
            "{sourceLeagueId}",
            sourceLeagueId
        );
        // Use this to test
        // const payload = {"tournament_ids": [218708]}; // TODO: remove this
        const payload = {"tournament_ids": [Number(sourceLeagueId)]};
        const response = await fetchFromApi(apiUrl, "POST", payload);

        if (!response?.data?.tournaments?.[0]?.marketGroupEvents?.length) {
            console.warn(`⚠️ No fixtures received for league ID: ${sourceLeagueId}`);
            return;
        }

        const fixtures = response.data.tournaments[0].marketGroupEvents[0].events;

        for (const fixture of fixtures) {
            if (this.fetchFixture) {
                await this.processFixture(
                    fixture,
                    leagueId,
                    sourceLeagueId
                );
            }
            if (this.fetchOdd) {
                await this.fetchAndProcessOdds(fixture, leagueId, sourceLeagueId);
            } else {
                console.warn(
                    `⚠️ Skipping odds fetch for fixture: ${fixture.id} due to failed processing.`
                );
            }
        }
    }

    private async processFixture(
        fixture: any,
        leagueId: number,
        sourceLeagueId: string
    ): Promise<boolean> {
        const {
            id: sourceFixtureId,
            home: homeTeamRaw,
            away: awayTeamRaw,
            start_time: startTime,
        } = fixture;
        const eventDate = new Date(startTime);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day

        if (eventDate < today) {
            console.log(`🗓️ Skipping past fixture: ${homeTeamRaw} vs ${awayTeamRaw}`);
            return false;
        }

        // **Apply Name Mapping for Home and Away Teams**
        const homeTeam = teamNameMappings[homeTeamRaw] || homeTeamRaw;
        const awayTeam = teamNameMappings[awayTeamRaw] || awayTeamRaw;

        // **Match fixture in database**
        let matchedFixture = await db("fixtures")
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
            .andWhere("fixtures.date", ">=", today)
            .andWhere("fixtures.league_id", leagueId)
            .first();

        if (!matchedFixture) {
            console.warn(
                `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam} in league ${leagueId}`
            );
            return false;
        }

        // **Insert into source_matches**
        const result = await db("source_matches")
            .insert({
                source_fixture_id: sourceFixtureId,
                source_competition_id: sourceLeagueId,
                source_event_name: `${homeTeam} vs ${awayTeam}`,
                fixture_id: matchedFixture.id,
                competition_id: matchedFixture.parent_league_id,
                source_id: this.sourceId,
            })
            .onConflict(["fixture_id", "source_id"])
            .ignore()
            .returning("*");

        if (result.length > 0) {
            console.log(
                `✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
            );
        } else {
            console.warn(
                `⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${matchedFixture.id})`
            );
        }

        return true;
    }

    private async fetchAndProcessOdds(
        fixtureData: any,
        leagueId: number,
        sourceLeagueId: string
    ) {
        const {id: sourceFixtureId} = fixtureData;
        const fixture = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select(
                "source_matches.source_fixture_id",
                "fixtures.id",
                "fixtures.date"
            )
            .where("source_matches.source_id", this.sourceId)
            .andWhere("source_matches.source_competition_id", sourceLeagueId)
            .andWhere("source_matches.source_fixture_id", sourceFixtureId)
            .andWhere("fixtures.date", ">=", new Date())
            .andWhere("leagues.is_active", true)
            .andWhere("leagues.external_id", leagueId)
            .first();

        if (!fixture) {
            console.warn(`❌ No Fixture found! for ${sourceFixtureId}`);
            return;
        }

        if (!fixtureData) {
            console.warn(`❌ No Fixture found!`);
            return;
        }

        if (!fixtureData?.markets?.length) {
            console.warn(`❌ No 'markets' array for fixture: ${sourceFixtureId}`);
            return;
        }

        const markets = fixtureData.markets;

        for (const market of markets) {
            // The market ID
            const marketId = market.market_id; // e.g. 7 => "Correct Score" // market_id

            // Map to Market Name
            const groupName = this.groupMapping[marketId];

            // find market
            const dbGroup = this.dbGroups.find(
                (market) => market.group_name === groupName
            );
            if (!dbGroup) {
                console.warn(`❌ No 'Group Found' : ${groupName}`);
                continue;
            }

            if (!market?.rows?.length) {
                console.warn(`❌ No 'Odds Found' : ${groupName}`);
                continue;
            }

            const odds = market.rows[0].odds;

            for (const odd of odds) {
                // The outcome code we want to map
                const outcomeCode = odd.code;

                const outcome = this.outcomeNameNewMapping[outcomeCode];

                const dbMarket = this.dbMarkets.find(
                    (marketType) =>
                        marketType.market_name === outcome && marketType.group_id === dbGroup.group_id
                );

                if (!dbMarket) {
                    console.warn(`❌ No 'Market Found' : ${outcome}`);
                    continue;
                }

                // If there's a single coefficient .value, store as an outcome
                await this.saveMarketOutcome(
                    dbGroup.group_id,
                    Number(odd.value),
                    dbMarket.market_id,
                    fixture.id,
                    sourceFixtureId
                );
            }

            // If you also have multiple "outcomes" in market.ME or market.outcomes, you’d loop them similarly
        }
    }

    private async getGroups(): Promise<Group[]> {
        return db("groups");
    }

    private async getMarkets(): Promise<Market[]> {
        return db("markets");
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
            .merge(["coefficient"]);

        console.log("Odds data inserted/updated successfully.");
    }
}

// Export and initialize
export default new FetchGeniusBetFixturesWithOddsService();
