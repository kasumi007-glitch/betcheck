import { fetchFromApiWithoutProxy } from "../../utils/HttpClientCI";
import fs from "fs";

class SaveAkwaBetLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://sports-apipro.logiqsport.com/api/pregame/getPregameData?providerId=1&h24=false&lang=en&siteid=43";
    private readonly fixturesApiUrl = "https://sports-apipro.logiqsport.com/api/Pregame/MarketsTreeEventsTable?lang=en&siteid=43";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching AkwaBet leagues and fixtures...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl);

        if (!response?.Sports) {
            console.error("❌ No sports data found in response");
            return;
        }

        // Find football sport (International name = "Football")
        const footballSport = response.Sports.find((sport: any) =>
            sport.Name?.International === "Football"
        );

        if (!footballSport) {
            console.error("❌ Football sport not found");
            return;
        }

        let jsonData: any = { countries: {} };

        for (const category of footballSport.Categories || []) {
            const countryName = category.Name?.International;
            if (!countryName) continue;

            jsonData.countries[countryName] = { leagues: {} };

            for (const tournament of category.Tournaments || []) {
                await this.processLeague(countryName, tournament, category.Id, jsonData);
            }
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/ci/ci_akwabet_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processLeague(countryName: string, tournament: any, categoryId: string, jsonData: any) {
        const leagueId = tournament.Id;
        const leagueName = tournament.Name?.International;

        if (!leagueId || !leagueName) return;

        console.log(`⚽ Processing league: ${leagueName}`);
        jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

        // Fetch fixtures for this league
        const requestData = {
            ProviderId: 1,
            tournId: `1,${categoryId},${leagueId}`,
            filter: "All",
            groupName: "null",
            subGroupName: "null"
        };

        const response = await fetchFromApiWithoutProxy(this.fixturesApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: { data: JSON.stringify(requestData) }
        });

        const events = response?.Contents?.Events || [];
        if (!events.length) {
            console.warn(`⚠️ No events found for league: ${leagueName}`);
            return;
        }

        for (const event of events) {
            const homeTeam = event.Info?.HomeTeamName?.International || "";
            const awayTeam = event.Info?.AwayTeamName?.International || "";

            if (homeTeam && awayTeam) {
                const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
            }
        }
    }
}

export default new SaveAkwaBetLeaguesWithFixturesService();