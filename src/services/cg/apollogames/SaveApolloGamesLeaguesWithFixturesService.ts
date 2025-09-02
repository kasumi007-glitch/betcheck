import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCG";
import fs from "fs";
import { format } from 'date-fns';

class SaveApolloGamesLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://sportapis-apollo.webapis.sk/SportsOfferApi/api/sport/offer/v3/sports?OddsFilter=0";
    private readonly fixturesApiUrlTemplate = "https://sportapis-apollo.webapis.sk/SportsOfferApi/api/sport/offer/v3/sports/offer?Offset=0&Limit=50&DateFrom={dateFrom}&SportIds=388&CategoryIds={categoryId}&LeagueIds={leagueId}&DateTo=2033-09-11T21:00:00.612Z";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching ApolloGames leagues and fixtures...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl);

        if (!Array.isArray(response)) {
            console.error("❌ Unexpected response format from API");
            return;
        }

        // Find soccer sport (Id: 388)
        const soccerSport = response.find(sport => sport.Id === 388);
        if (!soccerSport) {
            console.error("❌ Soccer sport not found in API response");
            return;
        }

        let jsonData: any = { countries: {} };
        const dateFrom = format(new Date(), "yyyy-MM-dd'T'00:00:00'Z'");

        for (const category of soccerSport.Categories || []) {
            const countryName = category.Name;
            if (!countryName) continue;

            jsonData.countries[countryName] = { leagues: {} };

            for (const league of category.Leagues || []) {
                await this.processLeague(countryName, league, category.Id, dateFrom, jsonData);
            }
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/cg/cg_apollogames_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processLeague(countryName: string, league: any, categoryId: string, dateFrom: string, jsonData: any) {
        const leagueId = league.Id;
        const leagueName = league.Name;

        if (!leagueId || !leagueName) return;

        console.log(`⚽ Processing league: ${leagueName}`);
        jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

        // Fetch fixtures for this league
        const apiUrl = this.fixturesApiUrlTemplate
            .replace("{dateFrom}", encodeURIComponent(dateFrom))
            .replace("{categoryId}", categoryId)
            .replace("{leagueId}", leagueId);

        const response = await fetchFromApiWithoutProxy(apiUrl);

        if (!response?.Response?.length) {
            console.warn(`⚠️ No fixtures found for league ${leagueName}`);
            return;
        }

        for (const sport of response.Response) {
            for (const category of sport.Categories || []) {
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
}

export default new SaveApolloGamesLeaguesWithFixturesService();