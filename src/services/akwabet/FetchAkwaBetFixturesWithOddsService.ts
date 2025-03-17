import {db} from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import MarketType from "../../models/MarketType";
import {fetchFromApi} from "../../utils/ApiClientAkwaBet";
import {teamNameMappings} from "../teamNameMappings";

//for count get it from leagues "GC": 20, but must be multiple of 10
class FetchAkwaBetFixturesWithOddsService {
    private readonly sourceName = "AkwaBet";
    private sourceId!: number;

    // 1) Market ID → Market Name
    private readonly marketMapping: Record<number, string> = {
        14: "1X2",
        2211: "Over / Under",
        20562: "Both Teams to Score",
    };

    // 2) Market Name → Group Name
    private readonly marketGroupMapping: Record<string, string> = {
        "1X2": "Main",
        "Over / Under": "Main",
        "Both Teams to Score": "Main",
    };

    // 3) Outcome Name Mapping
    private readonly outcomeNameNewMapping: Record<string, string> = {
        "W1": "1",
        "Draw": "X",
        "W2": "2",
        "Over (2.5)": "Over",
        "Under (2.5)": "Under",
        "Yes": "Yes",
        "No": "No",
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
        const countries = await db("source_countries").where("source_id", this.sourceId);

        for (const country of countries) {
            // Todo: remove to load other countries (TEST)
            // if (country.external_id == 236) {

            // Fetch active leagues linked to AkwaBet
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
                    league.league_id,
                    country.external_id
                );
            }
            // }

        }

        console.log(`✅ Fixtures synced successfully from ${this.sourceName}!`);
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
                console.log('testetetete')
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

                const outcome = this.outcomeNameNewMapping[outcomeName];

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
const fetchAkwaBetFixturesWithOddsService = new FetchAkwaBetFixturesWithOddsService();

export default fetchAkwaBetFixturesWithOddsService;
