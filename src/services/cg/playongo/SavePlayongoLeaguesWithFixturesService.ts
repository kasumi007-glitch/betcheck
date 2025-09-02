import { httpClientFromApi } from "../../../utils/HttpClientCG";
import fs from "fs";

class SavePlayongoLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://prod-api.velisports.com/sportsbookwebsitewebapi/WebSite/GetPrematchTree?SportId=1&CurrencyId=CDF&LanguageId=en&PartnerId=2&PartnerName=paridirect&TimeZone=3";
    private readonly fixturesApiUrl = "https://prod-api.velisports.com/sportsbookwebsitewebapi/WebSite/GetMatchesByCompetitions";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching Playongo leagues and fixtures...");

        const response = await httpClientFromApi(this.leaguesApiUrl);

        if (!response?.Ss?.length) {
            console.error("❌ No sports data found in response");
            return;
        }

        // Find football sport (SI: 1)
        const footballSport = response.Ss.find((sport: any) => sport.SI === 1);
        if (!footballSport) {
            console.error("❌ Football sport not found in API response");
            return;
        }

        let jsonData: any = { countries: {} };

        for (const region of footballSport.Rs || []) {
            const countryName = region.RN;
            if (!countryName) continue;

            jsonData.countries[countryName] = { leagues: {} };

            for (const competition of region.Cs || []) {
                await this.processLeague(countryName, competition, region.RI, jsonData);
            }
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/cg/cg_playongo_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processLeague(countryName: string, competition: any, regionId: number, jsonData: any) {
        const leagueId = competition.CI;
        const leagueName = competition.CN;

        if (!leagueId || !leagueName) return;

        console.log(`⚽ Processing league: ${leagueName}`);
        jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

        // Fetch fixtures for this league
        const requestData = {
            competitionIds: [parseInt(leagueId)],
            matchType: 1,
            withLive: true,
            currencyId: "CDF",
            languageId: "en",
            partnerId: 2,
            partnerName: "paridirect",
            timeZone: 3
        };

        const response = await httpClientFromApi(this.fixturesApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            data: requestData
        });

        const matches = response?.Ms || [];
        if (!matches.length) {
            console.warn(`⚠️ No matches found for league ${leagueName}`);
            return;
        }

        for (const match of matches) {
            const homeTeam = match.Cs?.find((t: any) => t.O === 1)?.TN || "";
            const awayTeam = match.Cs?.find((t: any) => t.O === 2)?.TN || "";

            if (homeTeam && awayTeam) {
                const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
            }
        }
    }
}

export default new SavePlayongoLeaguesWithFixturesService();