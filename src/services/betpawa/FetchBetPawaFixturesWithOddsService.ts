import {db} from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import MarketType from "../../models/MarketType";
import {teamNameMappings} from "../teamNameMappings";
import {EventResponse} from "../interfaces/BetPawa/EventResponse";
import {ResponseData} from "../interfaces/BetPawa/ResponseData";
import {QueryObject} from "../interfaces/BetPawa/QueryObject";

class FetchBetPawaFixturesWithOddsService {
    private readonly sourceName = "BetPawa";
    private sourceId!: number;

    // Map the source market ID → Market Name
    private readonly marketMapping: Record<number, string> = {
        3743: "1X2",
        5000: "Over / Under",
        3795: "Both Teams to Score",
    };

    // Map market name to group name
    private readonly marketGroupMapping: Record<string, string> = {
        "1X2": "Main",
        "Over / Under": "Main",
        "Both Teams to Score": "Main",
    };

    // Outcome name mapping
    private readonly outcomeIdNewMapping: Record<number, string> = {
        3744: "1",
        3745: "X",
        3746: "2",
        5001: "Over",
        5002: "Under",
        3796: "Yes",
        3797: "No",
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
        const marketTypeIds = Object.keys(this.marketMapping);

        for (const marketTypeId of marketTypeIds) {
            // TODO: Remove/add test.
            // if (marketTypeId == "3743") {
            const marketName = this.marketMapping[Number(marketTypeId)];
            const events = await this.fetchAllFixtures(marketName, marketTypeId);

            // Fetch active leagues linked to BetPawa
            const leagues = await db("source_league_matches")
                .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
                .select(
                    "source_league_matches.source_league_id",
                    "leagues.external_id as league_id"
                )
                .where("source_league_matches.source_id", this.sourceId)
                .andWhere("leagues.is_active", true);

            for (const league of leagues) {
                for (const event of events) {
                    if (event.competition.id === league.source_league_id) {
                        await this.fetchAndProcessFixtures(
                            league.source_league_id,
                            league.league_id,
                            event
                        );
                    }
                }
            }
            // }
        }

        console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
    }

    private async fetchAllFixtures(marketName: string, marketTypeId: string): Promise<EventResponse[]> {
        const myHeaders = new Headers();
        myHeaders.append("accept", "*/*");
        myHeaders.append("accept-language", "en-US,en;q=0.9");
        myHeaders.append("devicetype", "web");
        myHeaders.append("priority", "u=1, i");
        myHeaders.append("referer", `https://www.betpawa.sn/events?marketId=${marketName}&categoryId=2`);
        myHeaders.append("sec-ch-ua", "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Microsoft Edge\";v=\"134\"");
        myHeaders.append("sec-ch-ua-mobile", "?0");
        myHeaders.append("sec-ch-ua-platform", "\"Windows\"");
        myHeaders.append("sec-fetch-dest", "empty");
        myHeaders.append("sec-fetch-mode", "cors");
        myHeaders.append("sec-fetch-site", "same-origin");
        myHeaders.append("traceid", "cb12065c-e282-4d18-853c-0988e5d6b195");
        myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0");
        myHeaders.append("vuejs", "true");
        myHeaders.append("x-pawa-brand", "betpawa-senegal");
        myHeaders.append("x-pawa-language", "en");
        myHeaders.append("Cookie", process.env.COOKIE_HEADER_BETPAWA_FIXTURES_WITH_ODDS ?? "");

        const requestOptions: RequestInit = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        const eventTypeName = "UPCOMING";
        const sportId = ["2"]; // Football.
        const take = 100; // Max is 100.

        let skip = 0;
        let hasMoreData = true;
        let allFixtures: EventResponse[] = [];

        while (hasMoreData) {
            const queryObject: QueryObject = {
                queries: [
                    {
                        query: {
                            eventType: eventTypeName,
                            categories: sportId,
                            zones: {},
                            hasOdds: true
                        },
                        view: {
                            marketTypes: [marketTypeId]
                        },
                        skip: skip,
                        take: take
                    }
                ]
            };

            const apiUrl = `https://www.betpawa.sn/api/sportsbook/v2/events/lists/by-queries?q=${encodeURIComponent(JSON.stringify(queryObject))}`;

            try {
                const response: ResponseData = await this.fetchData(apiUrl, requestOptions);

                if (!response?.responses?.length) {
                    console.warn(`⚠️ No more fixtures received for market type ${marketName}, ID: ${marketTypeId}`);
                    hasMoreData = false;
                    break;
                }

                // Accumulate data
                response.responses.forEach((res) => {
                    allFixtures = allFixtures.concat(res.responses);
                });

                // Check if we got less than `take`, meaning no more pages
                if (response.responses[0].responses.length < take) {
                    hasMoreData = false;
                } else {
                    skip += take;
                }
            } catch (error) {
                console.error("Error fetching fixtures:", error);
                hasMoreData = false;
            }
        }

        return allFixtures;
    }

    private async fetchData(apiUrl: string, requestOptions: RequestInit) {
        try {
            const response = await fetch(apiUrl, requestOptions);
            return response.json();
        } catch (error) {
            console.error("Error fetching data:", error);
            return;
        }
    }

    private async fetchAndProcessFixtures(
        sourceLeagueId: string,
        leagueId: number,
        fixture: EventResponse
    ) {
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

    private async processFixture(
        fixture: any,
        leagueId: number,
        sourceLeagueId: string
    ): Promise<boolean> {
        const {
            id: sourceFixtureId,
            participants,
            startTime,
        } = fixture;
        const homeTeamRaw = participants[0]?.name;
        const awayTeamRaw = participants[1]?.name;

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

        if (!fixtureData) {
            console.warn(`❌ No Fixture found!`);
            return;
        }

        if (!fixtureData?.markets?.length) {
            console.warn(`❌ No 'Markets' array for fixture: ${sourceFixtureId}`);
            return;
        }

        const markets = fixtureData.markets;

        for (const marketObj of markets) {
            // Market ID
            const marketId = marketObj.marketType.id; // e.g. 7 => "Correct Score"

            // 1) Map G => Market Name
            const marketName = this.marketMapping[Number(marketId)];

            // find market
            const dbMarket = this.dbMarkets.find(
                (market) => market.name === marketName
            );
            if (!dbMarket) {
                console.warn(`❌ No 'Market Found' : ${marketName}`);
                continue;
            }

            if (!marketObj.prices?.length) {
                console.warn(`❌ No 'Outcomes Found for' : ${marketName}`);
                continue;
            }

            for (const outcomeData of marketObj.prices) {
                // The outcome ID we want to map
                const outcomeId = outcomeData.typeId; // e.g. 3744 '1'

                const outcome = this.outcomeIdNewMapping[outcomeId];

                const dbMarketType = this.dbMarketTypes.find(
                    (marketType) =>
                        marketType.name === outcome && marketType.market_id === dbMarket.id
                );
                if (!dbMarketType) {
                    console.warn(`❌ No 'Market Type Found' : ${marketName}`);
                    continue;
                }

                // If there's a single coefficient .Value, store as an outcome
                await this.saveMarketOutcome(
                    dbMarketType.id,
                    outcomeData.price,
                    dbMarket.id,
                    fixture.id,
                    sourceFixtureId
                );
            }
            // If you also have multiple "outcomes" in marketObj.ME or marketObj.outcomes, you’d loop them similarly
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

const fetchBetPawaFixturesWithOddsService = new FetchBetPawaFixturesWithOddsService();

export default fetchBetPawaFixturesWithOddsService;
