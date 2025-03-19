import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClientWithPost";
import fs from "fs";

class SaveGuineeGamesLeaguesWithFixturesService {
    private readonly apiUrl =
        "https://sports-api.guineegames.com/v1/competitions?country=GN&group=g6&platform=desktop&locale=en&timeOffset=-180&sportId=1";
    private readonly fixturesApiUrlTemplate =
        "https://sports-api.guineegames.com/v1/events?country=GN&group=g6&platform=desktop&locale=en&sportId=1&competitionId={sourceLeagueId}&marketId={sourceMarketId}&isGroup=false";
    private readonly sourceName = "GuineeGames";
    private sourceId!: number;

    private readonly groupMapping: Record<number, string> = {
        3: "1X2",
        29: "Over / Under",
        7: "Both Teams to Score",
    };

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({name: this.sourceName})
                .returning("id");
        } else {
            this.sourceId = source.id;
        }
    }

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching GuineeGames leagues...");
        const response = await fetchFromApi(this.apiUrl);
        if (!response?.categories?.length) {
            console.warn("⚠️ No leagues found in GuineeGames API response.");
            return;
        }

        let jsonData: any = {countries: {}};
        const matches = response.categories;

        for (const country of matches) {
            if (!country.competitions) continue; // Skip if no leagues exist

            await this.processCountry(country, jsonData);
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        fs.writeFileSync(
            "guineegames_leagues_fixtures.json",
            JSON.stringify(jsonData, null, 2)
        );
        console.log("✅ JSON file generated: guineegames_leagues_fixtures.json");
    }

    private async processCountry(country: any, jsonData: any) {
        const countryId = country.id;
        const countryName = country.name;
        console.log(`🌍 Processing country: ${countryName}`);

        jsonData.countries[countryName] = {leagues: {}};

        if (country.competitions) {
            for (const league of country.competitions) {
                await this.processLeague(league, jsonData, countryName);
            }
        }
    }

    private async processLeague(league: any, jsonData: any, countryName: string) {
        const leagueId = league.id;
        const leagueName = league.name;
        console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

        jsonData.countries[countryName].leagues[leagueId] = {
            name: leagueName,
            fixtures: [],
        };

        const sourceMarketIds = Object.keys(this.groupMapping);

        for (const sourceMarketId of sourceMarketIds) {
            await this.fetchAndProcessFixtures(leagueId, jsonData, countryName, sourceMarketId);
        }
    }

    private async fetchAndProcessFixtures(
        leagueId: number,
        jsonData: any,
        countryName: string,
        sourceMarketId: string,
    ) {
        const fixturesUrl = this.fixturesApiUrlTemplate.replace(
            "{sourceLeagueId}",
            String(leagueId)
        ).replace(
            "{sourceMarketId}",
            sourceMarketId
        );

        const response = await fetchFromApi(fixturesUrl);

        if (!response?.data?.categories.length) return;

        const countryData = response.data.categories;

        for (const country of countryData) {
            const leagues = country.competitions;

            if (!leagues.length) {
                console.warn(`⚠️ No league data received for league ID: ${leagueId}`);
                return;
            }

            for (const league of leagues) {
                const fixtures = league.events;

                if (!fixtures.length) {
                    console.warn(`⚠️ No fixtures received for league ID: ${leagueId}`);
                    return;
                }
                for (const fixture of fixtures) {
                    this.processMatch(fixture, leagueId, jsonData, countryName);
                }
            }
        }
    }

    private processMatch(
        match: any,
        leagueId: number,
        jsonData: any,
        countryName: string
    ) {
        const homeTeam = match.eventNames[0].trim();
        const awayTeam = match.eventNames[1].trim();

        if (
            homeTeam &&
            awayTeam &&
            jsonData.countries[countryName].leagues[leagueId]
        ) {
            const fixtures =
                jsonData.countries[countryName].leagues[leagueId].fixtures;
            if (!fixtures.includes(homeTeam)) {
                fixtures.push(homeTeam);
            }
            if (!fixtures.includes(awayTeam)) {
                fixtures.push(awayTeam);
            }
        }
    }
}

export default new SaveGuineeGamesLeaguesWithFixturesService();
