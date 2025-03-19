import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClientAkwaBet";
import fs from "fs";

class SaveAkwaBetLeaguesWithFixturesService {
    private readonly apiUrl =
        "https://api.logiqsport.com:60009/api/pregame/getPregameData?providerId=1&h24=false&lang=en&siteid=43";
    private readonly fixturesApiUrl =
        "https://api.logiqsport.com:60009/api/Pregame/MarketsTreeEventsTable?lang=en&siteid=43";
    private readonly sourceName = "AkwaBet";
    private sourceId!: number;

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
        console.log("🚀 Fetching AkwaBet leagues...");

        const response = await fetchFromApi(this.apiUrl);
        if (!response?.Sports?.length) {
            console.warn("⚠️ No leagues found in AkwaBet API response.");
            return;
        }

        let jsonData: any = {countries: {}};
        const sports = response.Sports;

        for (const sport of sports) {
            if (sport.Name?.International === "Football") {
                if (!sport.Categories) continue; // Skip if no leagues exist

                for (const country of sport.Categories) {
                    await this.processCountry(country, jsonData);
                }
            }
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        fs.writeFileSync(
            "akwabet_leagues_fixtures.json",
            JSON.stringify(jsonData, null, 2)
        );
        console.log("✅ JSON file generated: akwabet_leagues_fixtures.json");
    }

    private async processCountry(country: any, jsonData: any) {
        const countryId = country.Id;
        const countryName = country.Name.International;
        console.log(`🌍 Processing country: ${countryName}`);

        jsonData.countries[countryName] = {
            id: countryId,
            name: countryName,
            leagues: {}
        };

        if (country.Tournaments) {
            for (const league of country.Tournaments) {
                await this.processLeague(league, jsonData, countryName, countryId);
            }
        }
    }

    private async processLeague(league: any, jsonData: any, countryName: string, countryId: number) {
        const leagueId = league.Id;
        const leagueName = league.Name.International;
        console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

        jsonData.countries[countryName].leagues[leagueId] = {
            name: leagueName,
            fixtures: [],
        };

        await this.fetchAndProcessFixtures(leagueId, jsonData, countryName, countryId);
    }

    private async fetchAndProcessFixtures(
        leagueId: number,
        jsonData: any,
        countryName: string,
        countryId: number
    ) {
        const fixturesUrl = this.fixturesApiUrl;

        const payloadData = {
            data: JSON.stringify({
                ProviderId: 1, // Fixed value
                tournId: `1,${String(countryId)},${String(leagueId)}`, // Concatenated tournId format: sportId, countryId, tournamentId
                filter: "All",
                groupName: null,
                subGroupName: null,
            }),
        };

        const response = await fetchFromApi(fixturesUrl, "POST", payloadData);

        if (!response?.Contents) {
            console.warn(`⚠️ No fixtures received for league  ID: ${leagueId}`);
            return;
        }

        if (!response?.Contents?.Events.length) {
            console.warn(`⚠️ No fixtures received for league  ID: ${leagueId}`);
            return;
        }

        const fixtures = response?.Contents?.Events;

        for (const fixture of fixtures) {
            this.processMatch(fixture, leagueId, jsonData, countryName);
        }
    }

    private processMatch(
        match: any,
        leagueId: number,
        jsonData: any,
        countryName: string
    ) {
        const homeTeam = match.Info?.HomeTeamName?.International?.trim();
        const awayTeam = match.Info?.AwayTeamName?.International?.trim();

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

export default new SaveAkwaBetLeaguesWithFixturesService();
