import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClientGN";
import fs from "fs";

class SaveYellowBetLeaguesWithFixturesService {
    private readonly apiUrl =
        "https://yellowbet.com.gn/services/evapi/event/GetSportsTree?statusId=0&eventTypeId=0";
    private readonly fixturesApiUrlTemplate =
        "https://yellowbet.com.gn/services/evapi/event/GetEvents?betTypeIds=-1&take=100&statusId=0&eventTypeId=0&leagueIds={leagueId}";
    private readonly sourceName = "YELLOWBET";
    private sourceId!: number;

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({ name: this.sourceName })
                .returning("id");
        } else {
            this.sourceId = source.id;
        }
    }

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching YellowBet leagues...");
        const response = await httpClientFromApi(this.apiUrl);

        if (!response?.data?.cl?.length) {
            console.warn(`⚠️ No leagues data received from ${this.sourceName}.`);
            return;
        }

        let jsonData: any = { countries: {} };

        // Find the Soccer category
        const football = response.data.cl.find((sport: any) => sport.n === "Soccer");
        if (!football?.cl?.length) {
            console.warn(`⚠️ No soccer leagues found.`);
            return;
        }

        // Process leagues under soccer
        for (const node of football.cl) {
            await this.processCountry(node, jsonData);
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        // 🗓️ Add today's date
        const today = new Date();
        const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

        // 📝 Save into /src/files/ folder
        const filePath = `./files/common/yellowbet_countries_leagues_fixtures_${dateStr}.json`;
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processCountry(node: any, jsonData: any) {
        const countryName = node.n;
        console.log(`🌍 Processing country: ${countryName}`);

        jsonData.countries[countryName] = { leagues: {} };

        for (const league of node.cl) {
            await this.processLeague(league, jsonData, countryName);
        }
    }

    private async processLeague(league: any, jsonData: any, countryName: string) {
        const leagueId = league.id;
        const leagueName = league.n;
        console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

        jsonData.countries[countryName].leagues[leagueId] = {
            name: leagueName,
            fixtures: [],
        };
        await this.fetchAndProcessFixtures(leagueId, jsonData, countryName);
    }

    private async fetchAndProcessFixtures(
        leagueId: number,
        jsonData: any,
        countryName: string
    ) {
        const fixturesUrl = this.fixturesApiUrlTemplate.replace(
            "{leagueId}",
            String(leagueId)
        );
        const response = await httpClientFromApi(fixturesUrl);

        if (!response?.data?.length) {
            console.warn(`⚠️ No fixtures found for league ID: ${leagueId}`);
            return;
        }

        for (const fixture of response.data) {
            this.processMatch(fixture, leagueId, jsonData, countryName);
        }
    }

    private processMatch(
        fixture: any,
        leagueId: number,
        jsonData: any,
        countryName: string
    ) {
        const homeTeam = fixture.h.trim();
        const awayTeam = fixture.a.trim();
        const fixtureDate = fixture.gt;

        if (
            homeTeam &&
            awayTeam &&
            jsonData.countries[countryName].leagues[leagueId]
        ) {
            const fixtures =
                jsonData.countries[countryName].leagues[leagueId].fixtures;
            fixtures.push({ home: homeTeam, away: awayTeam, date: fixtureDate });
        }
    }
}

export default new SaveYellowBetLeaguesWithFixturesService();
