import { httpClientFromApi } from "../../../utils/HttpClientCI";
import fs from "fs";

class SaveCiBetclicLeaguesWithFixturesService {
    private readonly baseUrl = "https://www.betclic.ci/football-sfootball";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching CI_BETCLIC leagues and fixtures...");

        const response = await httpClientFromApi(this.baseUrl);
        const ngState = this.extractLeagueNgState(response);
        if (!ngState) return;

        let jsonData: any = { countries: {} };

        const footballSport = ngState?.payload?.sports?.find((s: any) => s.sportCode === "football") ?? [];
        if (!footballSport) return;

        for (const country of footballSport?.countries ?? []) {
            if (!country.code || !country.competitions?.length) continue;
            await this.processCountry(country, jsonData);
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/common/betclic_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private extractLeagueNgState(response: string): any {
        const ngStateRegex = /<script id="ng-state" type="application\/json">({.+?})<\/script>/;
        const match = response.match(ngStateRegex);
        if (!match) return null;

        try {
            const json = JSON.parse(match[1]);
            // Find the grpc response that contains sports data
            for (const key in json) {
                if (json[key]?.response?.payload?.sports) {
                    return json[key].response;
                }
            }
            return null;
        } catch (error) {
            console.error("Error parsing ng-state JSON:", error);
            return null;
        }
    }

    private extractFixtureNgState(response: string): any {
        const ngStateRegex = /<script id="ng-state" type="application\/json">({.+?})<\/script>/;
        const match = response.match(ngStateRegex);
        if (!match) return null;

        try {
            const json = JSON.parse(match[1]);
            // Find the grpc response that contains matches data
            for (const key in json) {
                if (json[key]?.response?.payload?.matches) {
                    return json[key].response;
                }
            }
            return null;
        } catch (error) {
            console.error("Error parsing ng-state JSON:", error);
            return null;
        }
    }

    private async processCountry(country: any, jsonData: any) {
        const countryName = country.name;
        const countryCode = country.code;
        jsonData.countries[countryName] = { leagues: {} };

        for (const league of country.competitions) {
            if (!league.competitionId) continue;
            await this.processLeague(league, countryName, countryCode, jsonData);
        }
    }

    private async processLeague(league: any, countryName: string, countryCode: string, jsonData: any) {
        const leagueId = league.competitionId;
        const leagueName = league.competitionName;
        console.log(`⚽ Processing league: ${leagueName}`);

        jsonData.countries[countryName].leagues[leagueId] = {
            name: leagueName,
            // slug: this.createLeagueSlug(leagueName, leagueId),
            fixtures: []
        };

        await this.fetchLeagueFixtures(leagueName, leagueId, countryName, jsonData);
    }

    private createLeagueSlug(competitionName: string, competitionId: string): string {
        return competitionName
            .toLowerCase()
            .replace(/\./g, "")
            .replace(/\s+/g, "-")
            .replace(/--/g, "-") + `-c${competitionId}`;
    }

    private async fetchLeagueFixtures(leagueName: string, leagueId: string, countryName: string, jsonData: any) {
        const leagueSlug = this.createLeagueSlug(leagueName, leagueId);
        const url = `${this.baseUrl}/${leagueSlug}`;

        try {
            const response = await httpClientFromApi(url);
            const ngState = this.extractFixtureNgState(response);
            if (!ngState) return;

            const matches = ngState?.payload?.matches || [];
            for (const match of matches) {
                if (!match.matchId) continue;

                const homeTeam = match.contestants?.[0]?.name?.trim() || "";
                const awayTeam = match.contestants?.[1]?.name?.trim() || "";

                if (homeTeam && awayTeam) {
                    const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                    if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                    if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
                }
            }
        } catch (error) {
            console.error(`❌ Error fetching fixtures for league ${leagueId}:`, error);
        }
    }
}

export default new SaveCiBetclicLeaguesWithFixturesService();