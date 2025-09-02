import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClientSN";
import fs from "fs";

class SaveBetPawaLeaguesWithFixturesService {
    private readonly apiUrl = "https://www.betpawa.sn/api/sportsbook/v3/categories/list/2";
    private readonly fixtureApiUrl = "https://www.betpawa.sn/api/sportsbook/v2/events/lists/by-queries";
    private readonly sourceName = "BETPAWA";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching BetPawa regions and leagues...");

        const response = await httpClientFromApi(this.apiUrl, {
            headers: {
                accept: "*/*",
                "x-pawa-brand": "betpawa-senegal",
                "x-pawa-language": "en",
                Cookie: process.env.COOKIE_HEADER_BETPAWA_LEAGUES ?? ""
            }
        });

        if (!response?.withRegions?.length) {
            console.warn("⚠️ No regions returned from BetPawa.");
            return;
        }

        let jsonData: any = { countries: {} };

        for (const regionObj of response.withRegions[0].regions || []) {
            const countryName = regionObj.region.name.trim();
            const countryId = regionObj.region.id;
            console.log(`🔍 Processing country: ${countryName}`);

            jsonData.countries[countryName] = { leagues: {} };

            for (const league of regionObj.competitions || []) {
                const leagueId = league.competition.id;
                const leagueName = league.competition.name.trim();

                console.log(`⚽ Processing league: ${leagueName}`);
                jsonData.countries[countryName].leagues[leagueId] = {
                    name: leagueName,
                    fixtures: []
                };

                await this.fetchAndProcessFixtures(
                    leagueId,
                    jsonData,
                    countryName,
                    leagueName
                );
            }
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/common/betpawa_countries_leagues_fixtures_${dateStr}.json`;
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file saved at ${filePath}`);
    }

    private async fetchAndProcessFixtures(
        leagueId: number,
        jsonData: any,
        countryName: string,
        leagueName: string
    ) {
        const query = {
            queries: [
                {
                    query: {
                        eventType: "UPCOMING",
                        categories: ["2"],
                        zones: {
                            competitions: [leagueId],
                        },
                        hasOdds: true
                    },
                    view: {
                        marketTypes: ["3743"]
                    },
                    skip: 0,
                    take: 100
                }
            ]
        };

        const apiUrl = `${this.fixtureApiUrl}?q=${encodeURIComponent(
            JSON.stringify(query)
        )}`;

        const response = await httpClientFromApi(apiUrl, {
            headers: {
                accept: "*/*",
                "x-pawa-brand": "betpawa-senegal",
                "x-pawa-language": "en",
                Cookie: process.env.COOKIE_HEADER_BETPAWA_FIXTURES_WITH_ODDS ?? ""
            }
        });

        if (!response?.responses?.length) return;

        for (const res of response.responses) {
            for (const match of res.responses || []) {
                if (
                    match.competition.id === leagueId &&
                    match.participants?.length === 2
                ) {
                    const homeTeam = match.participants[0]?.name.trim();
                    const awayTeam = match.participants[1]?.name.trim();
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

export default new SaveBetPawaLeaguesWithFixturesService();
