import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../../utils/HttpClientSL";
import fs from "fs";

class SaveBWinnersLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://bwinners.sl/services/evapi/event/GetSportsTree?statusId=0&eventTypeId=0";
    private readonly fixturesApiUrl = "https://bwinners.sl/services/evapi/event/GetEvents?betTypeIds=-1&take=100&statusId=0&eventTypeId=0";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching BWinners leagues and fixtures...");

        const response = await httpClientFromApi(this.leaguesApiUrl);

        if (!response?.data?.cl) {
            console.error("❌ No sports data found in response");
            return;
        }

        // Find soccer sport
        const soccerSport = response.data.cl.find((sport: any) =>
            sport.n === "Soccer"
        );

        if (!soccerSport) {
            console.error("❌ Soccer sport not found");
            return;
        }

        let jsonData: any = { categories: {} };

        for (const category of soccerSport.cl || []) {
            const categoryName = category.n;
            if (!categoryName) continue;

            jsonData.categories[categoryName] = { leagues: {} };

            for (const tournament of category.cl || []) {
                await this.processLeague(categoryName, tournament, category.id, jsonData);
            }
        }

        jsonData.categories = Object.fromEntries(
            Object.entries(jsonData.categories).sort(([a], [b]) => a.localeCompare(b))
        );

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/sl/sl_bwinners_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processLeague(categoryName: string, tournament: any, categoryId: string, jsonData: any) {
        const leagueId = tournament.id;
        const leagueName = tournament.n;

        if (!leagueId || !leagueName) return;

        console.log(`⚽ Processing league: ${leagueName}`);
        jsonData.categories[categoryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

        // Fetch fixtures for this league
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateFrom = today.toISOString().split('T')[0] + 'T00:00:00Z';

        const url = `${this.fixturesApiUrl}&leagueIds=${leagueId}&DateFrom=${encodeURIComponent(dateFrom)}`;

        const response = await httpClientFromApi(url);

        const events = response?.data || [];
        if (!events.length) {
            console.warn(`⚠️ No events found for league: ${leagueName}`);
            return;
        }

        for (const event of events) {
            const homeTeam = event.h || "";
            const awayTeam = event.a || "";

            if (homeTeam && awayTeam) {
                const fixtures = jsonData.categories[categoryName].leagues[leagueId].fixtures;
                if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
            }
        }
    }
}

export default new SaveBWinnersLeaguesWithFixturesService();