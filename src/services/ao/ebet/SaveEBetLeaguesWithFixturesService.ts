import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientAO";
import fs from "fs";

class SaveEBetLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://bitville-sports.bitville-api.com/sports/callback/tournaments?bsid=sr%3Asport%3A1&code=online-ebet-ao-sports&locale=en";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching EBet leagues and fixtures...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            headers: {
                "Cookie": "PHPSESSID=g0cf9ik60plpubg454fsscthob"
            }
        });

        if (!response?.countries) {
            console.warn("⚠️ No countries data received from API");
            return;
        }

        let jsonData: any = { countries: {} };

        for (const country of response.countries) {
            await this.processCountry(country, jsonData);
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/ao_ebet_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processCountry(country: any, jsonData: any) {
        const countryName = country.name.trim();
        jsonData.countries[countryName] = { leagues: {} };

        if (!country.tournaments?.length) return;

        for (const tournament of country.tournaments) {
            await this.processTournament(tournament, countryName, country.id, jsonData);
        }
    }

    private async processTournament(tournament: any, countryName: string, countryId: string, jsonData: any) {
        const leagueId = tournament.id;
        const leagueName = tournament.name.trim();
        console.log(`⚽ Processing league: ${leagueName}`);

        jsonData.countries[countryName].leagues[leagueId] = {
            name: leagueName,
            fixtures: []
        };

        // Fetch fixtures for this tournament
        const fixturesUrl = `https://bitville-sports.bitville-api.com/sports/callback/events?page=1&tournament=${leagueId}&country=${encodeURIComponent(countryId)}&time_slug=all&bsid=sr%3Asport%3A1&code=online-ebet-ao-sports`;

        const response = await fetchFromApiWithoutProxy(fixturesUrl, {
            headers: {
                "Cookie": "PHPSESSID=g0cf9ik60plpubg454fsscthob"
            }
        });

        if (!response) return;

        // Get all unique matches from all markets
        const allMatches = new Set<any>();
        for (const marketData of Object.values<any>(response)) {
            if (marketData.matches) {
                Object.keys(marketData.matches).forEach(matchId => allMatches.add(matchId));
            }
        }

        // Get match details from the first market (they all have the same match details)
        const firstMarket = Object.values<any>(response)[0];
        if (!firstMarket?.matches) return;

        for (const matchId of allMatches) {
            const match = firstMarket.matches[matchId];
            if (match?.competitors?.length === 2) {
                const [homeTeam, awayTeam] = match.competitors;
                const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
            }
        }
    }
}

export default new SaveEBetLeaguesWithFixturesService();