import {db} from "../../infrastructure/database/Database";
import Market from "../../models/Market";
import Group from "../../models/Group";
import {fetchFromApi} from "../../utils/ApiClientAkwaBet";
import {teamNameMappings} from "../teamNameMappings";
import fs from "fs";

const path = require("path");

class FetchAkwaBetFixturesWithOddsService {
    private readonly sourceName = "AkwaBet";
    private sourceId!: number;
    private fetchFixture!: boolean;
    private fetchOdd!: boolean;

    // 1) Market ID → Market Name
    private readonly groupMapping: Record<number, string> = {
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
    private dbGroups: Group[] = [];

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
        this.dbGroups = await this.getGroups();
    }

    async syncFixtures(fetchFixture: boolean, fetchOdd: boolean = false) {
        await this.initialize();
        this.fetchFixture = fetchFixture;
        this.fetchOdd = fetchOdd;

        console.log(`🚀 Fetching fixtures from ${this.sourceName}...`);
        const filePath = path.join(process.cwd(), "akwabet_leagues_fixtures.json");
        const rawData = fs.readFileSync(filePath, "utf8");

        const jsonData: CountriesData = JSON.parse(rawData);
        const countries: Country[] = Object.values(jsonData.countries).map(({id, name}) => ({id, name}));

        for (const country of countries) {
            const externalCountryId = String(country.id);
            // Todo: remove to load other countries (TEST)
            // if (country.external_id == "236") {

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
                    externalCountryId
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

        for (const fixture of response?.Contents?.Events) {
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

        if (!fixture) {
            console.warn(`❌ No Fixture found! Fixture: ${sourceFixtureId} league: ${leagueId}`);
            return;
        }

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
            const groupName = this.groupMapping[marketId];

            // find market
            const dbGroup = this.dbGroups.find(
                (market) => market.group_name === groupName
            );
            if (!dbGroup) {
                console.warn(`❌ No 'Group Found' : ${groupName}`);
                continue;
            }

            if (!marketObj.MarketFields?.length) {
                console.warn(`❌ No 'Outcomes Found for' : ${groupName}`);
                continue;
            }

            for (const outcomeData of marketObj.MarketFields) {
                // the outcome ID we want to map
                const outcomeName = outcomeData.FieldName.International; // e.g. 221

                const outcome = this.outcomeNameNewMapping[outcomeName];

                const dbMarket = this.dbMarkets.find(
                    (marketType) =>
                        marketType.market_name === outcome && marketType.group_id === dbGroup.group_id
                );

                if (!dbMarket) {
                    console.warn(`❌ No 'Market Found' : ${outcome}`);
                    continue;
                }

                // If there's a single coefficient .Value, store as an outcome
                await this.saveMarketOutcome(
                    dbGroup.group_id,
                    Number(outcomeData.Value),
                    dbMarket.market_id,
                    fixture.id,
                    sourceFixtureId
                );
            }
            //     // If you also have multiple "outcomes" in marketObj.ME or marketObj.outcomes, you’d loop them similarly
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
                market_id: marketId,
                group_id: groupId,
                coefficient,
                fixture_id: fixtureId,
                external_source_fixture_id: externalSourceFixtureId,
                source_id: this.sourceId,
            })
            .onConflict([
                "market_id",
                "group_id",
                "fixture_id",
                "external_source_fixture_id",
                "source_id",
            ])
            .merge(["coefficient"]);

        console.log("Odds data inserted/updated successfully.");
    }
}
// TODO: Refactor them into separate files
interface Country {
    id: number;
    name: string;
}

interface CountriesData {
    countries: Record<string, Country>;
}

// Export and initialize
const fetchAkwaBetFixturesWithOddsService = new FetchAkwaBetFixturesWithOddsService();

export default fetchAkwaBetFixturesWithOddsService;
