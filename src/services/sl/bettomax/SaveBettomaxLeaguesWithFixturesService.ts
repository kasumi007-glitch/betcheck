import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../../utils/HttpClientSL";
import fs from "fs";

class SaveBettomaxLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://sportapis-bettomax.webapis.sk/SportsOfferApi/api/sport/offer/v3/sports?OddsFilter=0";
    private readonly fixturesApiUrl = "https://sportapis-bettomax.webapis.sk/SportsOfferApi/api/sport/offer/v3/sports/offer";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching Bettomax leagues and fixtures...");

        const response = await httpClientFromApi(this.leaguesApiUrl, {
            headers: {
                'languageid': 'en',
                'Origin': 'https://bettomax.sl',
                'Referer': 'https://bettomax.sl/'
            }
        });

        if (!response?.length) {
            console.error("❌ No sports data found in response");
            return;
        }

        // Find soccer sport
        const soccerSport = response.find((sport: any) => sport.Name === "Soccer");
        if (!soccerSport) {
            console.error("❌ Soccer sport not found");
            return;
        }

        let jsonData: any = { countries: {} };

        for (const category of soccerSport.Categories || []) {
            const countryName = category.Name;
            if (!countryName) continue;

            jsonData.countries[countryName] = { leagues: {} };

            for (const league of category.Leagues || []) {
                await this.processLeague(countryName, league, category.Id, jsonData);
            }
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/sl/sl_bettomax_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processLeague(countryName: string, league: any, categoryId: string, jsonData: any) {
        const leagueId = league.Id;
        const leagueName = league.Name;

        if (!leagueId || !leagueName) return;

        console.log(`⚽ Processing league: ${leagueName}`);
        jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

        // Fetch fixtures for this league
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateFrom = today.toISOString();

        const url = new URL(this.fixturesApiUrl);
        url.searchParams.append("Offset", "0");
        url.searchParams.append("Limit", "50");
        url.searchParams.append("DateFrom", dateFrom);
        url.searchParams.append("SportIds", "388"); // Soccer ID
        url.searchParams.append("CategoryIds", categoryId);
        url.searchParams.append("LeagueIds", leagueId);
        url.searchParams.append("DateTo", "2033-09-29T21:00:00.060Z");
        url.searchParams.append("BetTypeKey", "3");

        const response = await httpClientFromApi(url.toString(), {
            headers: {
                'languageid': 'en',
                'Origin': 'https://bettomax.sl',
                'Referer': 'https://bettomax.sl/'
            }
        });

        const categories = response?.Response?.[0]?.Categories || [];
        if (!categories.length) {
            console.warn(`⚠️ No events found for league: ${leagueName}`);
            return;
        }

        for (const category of categories) {
            for (const leagueData of category.Leagues || []) {
                for (const match of leagueData.Matches || []) {
                    const homeTeam = match.TeamHome;
                    const awayTeam = match.TeamAway;

                    if (homeTeam && awayTeam) {
                        const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                        if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                        if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
                    }
                }
            }
        }
    }
}

export default new SaveBettomaxLeaguesWithFixturesService();