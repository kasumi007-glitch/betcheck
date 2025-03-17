import {db} from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import MarketType from "../../models/MarketType";
import {fetchFromApi} from "../../utils/ApiClient";
import {teamNameMappings} from "../teamNameMappings";

//for count get it from leagues "GC": 20, but must be multiple of 10
class FetchGuineeGamesFixturesWithOddsService {
    private readonly apiUrlTemplate =
        "https://sports-api.guineegames.com/v1/events?country=GN&group=g6&platform=desktop&locale=en&sportId=1&competitionId={sourceLeagueId}&marketId={sourceMarketId}&isGroup=false";

    private readonly sourceName = "GuineeGames";
    private sourceId!: number;

    // 1) Market ID → Market Name
    private readonly marketMapping: Record<number, string> = {
        3: "1X2",
        29: "Over / Under", // labelled as "Nombre total de buts"
        7: "Both Teams to Score", // Labelled as "Les deux équipes marquent"
    };

    // 2) Market Name → Group Name
    private readonly marketGroupMapping: Record<string, string> = {
        "1X2": "Main",
        "Over / Under": "Main",
        "Both Teams to Score": "Main",
    };

    // 3) Outcome Name Mapping
    private readonly outcomeIdNameMapping: Record<number, string> = {
        615: "1",
        616: "X",
        617: "2",
        1495: "Over", // labelled as "plus de"
        1496: "Under", // labelled as "moins de"
        626: "Yes", // labelled as "oui"
        627: "No", // labelled as "non"
    };

    private dbMarkets: Market[] = [];
    private dbMarketTypes: MarketType[] = [];

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
        this.dbMarketTypes = await this.getMarketTypes();
    }

    async syncFixtures() {
        console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);

        // Fetch active leagues linked to GuineeGames
        const leagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "leagues.external_id as league_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of leagues) {
            const sourceMarketIds = Object.keys(this.marketMapping);

            for (const sourceMarketId of sourceMarketIds) {
                await this.fetchAndProcessFixtures(
                    league.source_league_id,
                    league.league_id,
                    sourceMarketId
                );
            }
        }

        console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
    }

    private async fetchAndProcessFixtures(
        sourceLeagueId: string,
        leagueId: number,
        sourceMarketId: string
    ) {
        const apiUrl = this.apiUrlTemplate.replace(
            "{sourceLeagueId}",
            sourceLeagueId
        ).replace(
            "{sourceMarketId}",
            sourceMarketId
        );

        // TODO: Add/remove test
        // const apiUrl = this.apiUrlTemplate.replace(
        //     "{sourceLeagueId}",
        //     '1030903'
        // ).replace(
        //     "{sourceMarketId}",
        //     '7'
        // );

        const response = await fetchFromApi(apiUrl);

        if (!response?.data?.categories.length) {
            console.warn(`⚠️ No country categories received for league ID: ${sourceLeagueId}`);
            return;
        }

        const countryData = response.data.categories;

        for (const country of countryData) {
            const leagues = country.competitions;

            if (!leagues.length) {
                console.warn(`⚠️ No league data received for league ID: ${sourceLeagueId}`);
                return;
            }

            for (const league of leagues) {
                const fixtures = league.events;

                if (!fixtures.length) {
                    console.warn(`⚠️ No fixtures received for league ID: ${sourceLeagueId}`);
                    return;
                }

                for (const fixture of fixtures) {
                    if (!fixture?.markets?.length) {
                        console.warn(`⚠️ No fixtures received for league ID: ${sourceLeagueId}`);
                        return;
                    }
                    const isFixtureProcessed = await this.processFixture(
                        fixture,
                        leagueId,
                        sourceLeagueId
                    );

                    if (isFixtureProcessed) {
                       await this.fetchAndProcessOdds(fixture, leagueId, sourceLeagueId);
                    } else {
                        console.warn(
                            `⚠️ Skipping odds fetch for fixture: ${fixture.id} due to failed processing.`
                        );
                    }
                }
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
            startTime: startTime,
            eventNames: competingTeams
        } = fixture;
        const homeTeamRaw = competingTeams[0];
        const awayTeamRaw = competingTeams[1];

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
            const marketId = market.id; // e.g. 7 => "Correct Score" // market_id

            // Map to Market Name
            const marketName = this.marketMapping[marketId];

            // // find market
            const dbMarket = this.dbMarkets.find(
                (market) => market.name === marketName
            );
            if (!dbMarket) {
                console.warn(`❌ No 'Market Found' : ${marketName}`);
                continue;
            }

            if (!market?.outcomes?.length) {
                console.warn(`❌ No 'Odds Found' : ${marketName}`);
                continue;
            }

            const odds = market.outcomes;

            for (const odd of odds) {
                // The outcome code we want to map
                const outcomeId = odd.id;

                const outcome = this.outcomeIdNameMapping[outcomeId];

                const dbMarketType = this.dbMarketTypes.find(
                    (marketType) =>
                        marketType.name === outcome && marketType.market_id === dbMarket.id
                );

                if (!dbMarketType) {
                    console.warn(`❌ No 'Market Type Found' : ${marketName}`);
                    continue;
                }
                // If there's a single coefficient .value, store as an outcome
                await this.saveMarketOutcome(
                    dbMarketType.id,
                    Number(odd.value),
                    dbMarket.id,
                    fixture.id,
                    sourceFixtureId
                );
            }

            // If you also have multiple "outcomes" in market.ME or market.outcomes, you’d loop them similarly
        }
    }

    private async getMarkets(): Promise<Market[]> {
        return db("markets");
    }

    private async getMarketTypes(): Promise<MarketType[]> {
        return db("market_types");
    }

    private async saveMarketOutcome(
        marketTypeId: number,
        coefficient: number,
        marketId: number,
        fixtureId: number,
        externalSourceFixtureId: string
    ) {
        await db("odds")
            .insert({
                market_id: marketId,
                market_type_id: marketTypeId,
                coefficient,
                fixture_id: fixtureId,
                external_source_fixture_id: externalSourceFixtureId,
                source_id: this.sourceId,
            })
            .onConflict([
                "market_id",
                "market_type_id",
                "fixture_id",
                "external_source_fixture_id",
                "source_id",
            ])
            .merge(["coefficient"]);

        console.log("Odds data inserted/updated successfully.");
    }
}

// Export and initialize
const fetchGuineeGamesFixturesWithOddsService = new FetchGuineeGamesFixturesWithOddsService();

export default fetchGuineeGamesFixturesWithOddsService;
