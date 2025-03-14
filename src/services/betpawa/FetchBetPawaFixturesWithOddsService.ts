import {db} from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import MarketType from "../../models/MarketType";
import {fetchFromApi} from "../../utils/ApiClientAkwaBet";
import {MarketObj} from "../interfaces/MarketObj";
import {teamNameMappings} from "../teamNameMappings";

//for count get it from leagues "GC": 20, but must be multiple of 10
class FetchBetPawaFixturesWithOddsService {
    private readonly apiUrlTemplate =
        `https://www.betpawa.sn/api/sportsbook/v2/events/lists/by-queries?q={encodeURIComponent(JSON.stringify({
          queries: [{
            query: {
              eventType: eventType,
              categories: [categoryId],
              zones: {},
              hasOdds: true
            },
            view: {
              marketTypes: [marketType]
            },
            skip: skip,
            take: take
          }]
        }))}`;
    private readonly sourceName = "BetPawa";
    private sourceId!: number;

    // 1) Market ID → Market Name
    private readonly marketMapping: Record<number, string> = {
        3743: "1X2",
        5000: "Over / Under",
        3795: "Both Teams to Score",
    };

    // 2) Market Name → Group Name
    private readonly marketGroupMapping: Record<string, string> = {
        "1X2": "Main",
        "Over / Under": "Main",
        "Both Teams to Score": "Main",
    };

    // 3) Outcome Name Mapping
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

// sport, category, tournament
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
            // Todo: remove to load other market types (test)
            if (marketTypeId == "3743") {
                const marketName = this.marketMapping[marketTypeId];
                console.log(`https://www.betpawa.sn/events?marketId=${marketName}&categoryId=2`, 'marketName');
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
                const sportId = ["2"];
                const skip = 0; // make this dynamic
                const take = 20;

                const queryObject = {
                    queries: [
                        {
                            query: {
                                eventType: eventTypeName,
                                categories: sportId,
                                zones: {},
                                hasOdds: true
                            },
                            view: {
                                marketTypes: marketTypeId
                            },
                            skip: skip,
                            take: take
                        }
                    ]
                };

                const apiUrl = `https://www.betpawa.sn/api/sportsbook/v2/events/lists/by-queries?q=${encodeURIComponent(JSON.stringify(queryObject))}`;

                const response = await this.fetchData(apiUrl, requestOptions);
console.log(response,apiUrl, 'here');

                // Fetch active leagues linked to BetPawa
                // const leagues = await db("source_league_matches")
                //     .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
                //     .select(
                //         "source_league_matches.source_league_id",
                //         "leagues.external_id as league_id"
                //     )
                //     .where("source_league_matches.source_id", this.sourceId)
                //     .andWhere("leagues.is_active", true);
                //
                // for (const league of leagues) {
                //     await this.fetchAndProcessFixtures(
                //         league.source_league_id,
                //         league.league_id,
                //         country.external_id
                //     );
                // }
            }

        }

        console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
    }

    private async fetchData(apiUrl: string, requestOptions: RequestInit) {
        try {
            const response = await fetch(apiUrl, requestOptions);
            const result = await response.json();
            return result;
        } catch (error) {
            console.error("Error fetching data:", error);
            return;
        }
    }

    private async fetchAndProcessFixtures(
        sourceLeagueId: string,
        leagueId: number,
        countryExternalId: string,
    ) {
        const apiUrl = "https://api.logiqsport.com:60009/api/Pregame/MarketsTreeEventsTable?lang=en&siteid=43";

        const payloadData = {
            data: JSON.stringify({
                ProviderId: 1, // Fixed value
                tournId: `1,${countryExternalId},${sourceLeagueId}`, // Concatenated tournId format: sportId, countryId, tournamentId
                filter: "All",
                groupName: null,
                subGroupName: null,
            }),
        };

        const response = await fetchFromApi(apiUrl, "POST", payloadData);

        if (!response?.Contents) {
            console.warn(`⚠️ No fixtures received for league  ID: ${sourceLeagueId}`);
            return;
        }

        if (!response?.Contents?.Events.length) {
            console.warn(`⚠️ No fixtures received for league  ID: ${sourceLeagueId}`);
            return;
        }

        console.log(response?.Contents?.Events, 'events');

        for (const fixture of response?.Contents?.Events) {
            console.log('here')
            const isFixtureProcessed = await this.processFixture(
                fixture,
                leagueId,
                sourceLeagueId
            );

            if (isFixtureProcessed) {
                await this.fetchAndProcessOdds(fixture, leagueId, sourceLeagueId);
            } else {
                console.warn(
                    `⚠️ Skipping odds fetch for fixture: ${fixture.I} due to failed processing.`
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
            MatchId: sourceFixtureId,
            Info,
            DateOfMatch: startTime,
        } = fixture;
        const homeTeamRaw = Info?.HomeTeamName?.International;
        const awayTeamRaw = Info?.AwayTeamName?.International;

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
        const {MatchId: sourceFixtureId} = fixtureData;

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

        // Typically the markets are in data.Value.E
        if (!fixtureData?.Markets?.length) {
            console.warn(`❌ No 'Markets' array for fixture: ${sourceFixtureId}`);
            return;
        }

        // Process each "marketObj" in Markets
        const markets = fixtureData.Markets;

        for (const marketObj of markets) {

            // the market ID
            const marketId = marketObj.MarketTypeId; // e.g. 7 => "Correct Score"

            // 1) Map G => Market Name
            const marketName = this.marketMapping[marketId];

            // find market
            const dbMarket = this.dbMarkets.find(
                (market) => market.name === marketName
            );
            if (!dbMarket) {
                console.warn(`❌ No 'Market Found' : ${marketName}`);
                continue;
            }

            if (!marketObj.MarketFields?.length) {
                console.warn(`❌ No 'Outcomes Found for' : ${marketName}`);
                continue;
            }

            for (const outcomeData of marketObj.MarketFields) {
                // the outcome ID we want to map
                const outcomeName = outcomeData.FieldName.International; // e.g. 221

                const outcome = this.outcomeIdNewMapping[outcomeName];

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
                    Number(outcomeData.Value),
                    dbMarket.id,
                    fixture.id,
                    sourceFixtureId
                );
            }
            //     // If you also have multiple "outcomes" in marketObj.ME or marketObj.outcomes, you’d loop them similarly
        }
    }

    private async getMarkets(): Promise<Market[]> {
        let row: Market[] = await db("markets");
        return row;
    }

    private async getMarketTypes(): Promise<MarketType[]> {
        let row: MarketType[] = await db("market_types");
        return row;
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
const fetchBetPawaFixturesWithOddsService =
    new FetchBetPawaFixturesWithOddsService();

export default fetchBetPawaFixturesWithOddsService;
