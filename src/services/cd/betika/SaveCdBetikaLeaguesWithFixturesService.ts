import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";
import fs from "fs";

class SaveCdBetikaLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://api-cd.betika.com/v1/sports";
    private readonly fixturesApiUrl = "https://api-cd.betika.com/v1/uo/matches";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching CD_BETIKA leagues and fixtures...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl);
        let jsonData: any = { countries: {} };

        const footballSport = response?.data?.find((s: any) => s.sport_id === "3") ?? null;
        if (!footballSport) return;

        for (const category of footballSport.categories ?? []) {
            await this.processCategory(category, jsonData);
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/cd/cd_betika_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processCategory(category: any, jsonData: any) {
        const countryName = category.category_name;
        const countryId = category.category_id;
        jsonData.countries[countryName] = { leagues: {} };

        for (const competition of category.competitions) {
            if (!competition.competition_id) continue;
            await this.processLeague(competition, countryName, countryId, jsonData);
        }
    }

    private async processLeague(league: any, countryName: string, countryId: string, jsonData: any) {
        const leagueId = league.competition_id;
        const leagueName = league.competition_name;
        console.log(`⚽ Processing league: ${leagueName}`);

        jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

        await this.fetchLeagueFixtures(countryName, countryId, leagueId, jsonData);
    }

    private async fetchLeagueFixtures(countryName: string, countryId: string, leagueId: string, jsonData: any) {
        const url = `${this.fixturesApiUrl}?page=1&limit=100&tab=upcoming&sport_id=3&competition_id=${leagueId}&sort_id=2&period_id=9&esports=false`;
        const response = await fetchFromApiWithoutProxy(url);

        const matches = response?.data || [];

        for (const match of matches) {
            if (!match.parent_match_id) continue;
            const homeTeam = match.home_team?.trim() || "";
            const awayTeam = match.away_team?.trim() || "";

            if (homeTeam && awayTeam) {
                const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
            }
        }
    }
}

export default new SaveCdBetikaLeaguesWithFixturesService();