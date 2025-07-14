import fs from "fs";
import { fetchFromApiWithoutProxy } from "../../utils/HttpClientCI";

class SaveTopParserLeaguesWithFixturesService {
    private readonly countriesApiUrl = "https://api-gateway.top-parser.com/categories/get-many";
    private readonly leaguesApiUrl = "https://api-gateway.top-parser.com/tournaments/get-many";
    private readonly fixturesApiUrl = "https://api-gateway.top-parser.com/matches/get-many";
    private readonly SPORT_ID = 18; // Football

    async syncLeaguesAndFixtures() {
        const jsonData: any = { countries: {} };

        const countryRes = await fetchFromApiWithoutProxy(this.countriesApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-lang": "en-001" },
            data: JSON.stringify({ service: "PREMATCH", sportId: this.SPORT_ID }),
        });

        const countries = countryRes?.result?.items ?? [];

        for (const item of countries) {
            const category = item.category;
            if (!category) continue;

            const categoryId = category.id;
            const countryName = category.name.trim();
            jsonData.countries[countryName] = { leagues: {} };

            const leagueRes = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-lang": "en-001" },
                data: JSON.stringify({ service: "PREMATCH", sportId: this.SPORT_ID, categoryId }),
            });

            const leagues = leagueRes?.result?.items ?? [];

            const fixturesRes = await fetchFromApiWithoutProxy(this.fixturesApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-lang": "en-001" },
                data: JSON.stringify({ service: "PREMATCH", sportId: this.SPORT_ID, categoryId, limit: 40 }),
            });

            const matches = fixturesRes?.result?.items ?? [];

            for (const league of leagues) {
                const tournament = league.tournament;
                if (!tournament) continue;

                const leagueId = tournament.id;
                const leagueName = tournament.name.trim();

                jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

                const leagueFixtures = matches.filter((f: any) => f.tournamentId === leagueId);
                for (const match of leagueFixtures) {
                    const homeTeam = match.homeTeam?.name?.trim() ?? "";
                    const awayTeam = match.awayTeam?.name?.trim() ?? "";

                    if (homeTeam && awayTeam) {
                        const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                        if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                        if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
                    }
                }
            }
        }

        const dateStr = new Date().toISOString().split("T")[0];
        const filePath = `./files/1win_pro_leagues_fixtures_${dateStr}.json`;
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file saved: ${filePath}`);
    }
}

export default new SaveTopParserLeaguesWithFixturesService();
