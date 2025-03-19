import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClientWithPost";
import fs from "fs";

class SaveGeniusBetLeaguesWithFixturesService {
    private readonly apiUrl =
        "https://api.geniusbet.com.gn/api/v2/side-bar";
    private readonly fixturesApiUrlTemplate =
        "https://api.geniusbet.com.gn/api/v2/get-tournament-events-refactor";
    private readonly sourceName = "GeniusBet";
    private sourceId!: number;

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({name: this.sourceName})
                .returning("id");
        } else {
            this.sourceId = source.id;
        }
    }

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching GeniusBet leagues...");
        const response = await fetchFromApi(this.apiUrl);
        if (!response?.data?.sidebar?.matches?.length) {
            console.warn("⚠️ No leagues found in GeniusBet API response.");
            return;
        }

        let jsonData: any = {countries: {}};
        const matches = response.data.sidebar.matches;

        for (const match of matches) {
            if (match.name === "Soccer") {
                if (!match.categories) continue; // Skip if no leagues exist
                const countryData = match.categories;

                for (const country of countryData) {
                    await this.processCountry(country, jsonData);
                }
            }
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        fs.writeFileSync(
            "geniusbet_leagues_fixtures.json",
            JSON.stringify(jsonData, null, 2)
        );
        console.log("✅ JSON file generated: geniusbet_leagues_fixtures.json");
    }

    private async processCountry(country: any, jsonData: any) {
        const countryId = country.id;
        const countryName = country.name;
        console.log(`🌍 Processing country: ${countryName}`);

        jsonData.countries[countryName] = {leagues: {}};

        if (country.tournaments) {
            for (const league of country.tournaments) {
                await this.processLeague(league, jsonData, countryName);
            }
        }
    }

    private async processLeague(league: any, jsonData: any, countryName: string) {
        const leagueId = league.id;
        const leagueName = league.name;
        console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

        jsonData.countries[countryName].leagues[leagueId] = {
            name: leagueName,
            fixtures: [],
        };
        await this.fetchAndProcessFixtures(leagueId, jsonData, countryName);
    }

    private async fetchAndProcessFixtures(
        leagueId: number,
        jsonData: any,
        countryName: string
    ) {
        const fixturesUrl = this.fixturesApiUrlTemplate.replace(
            "{sourceLeagueId}",
            String(leagueId)
        );

        const payload = {"tournament_ids": [Number(leagueId)]};
        const response = await fetchFromApi(fixturesUrl, "POST", payload);

        if (!response?.data?.tournaments?.[0]?.marketGroupEvents?.length) return;

        const fixtures = response.data.tournaments[0].marketGroupEvents[0].events;

        for (const fixture of fixtures) {
            this.processMatch(fixture, leagueId, jsonData, countryName);
        }
    }

    private processMatch(
        match: any,
        leagueId: number,
        jsonData: any,
        countryName: string
    ) {
        const homeTeam = match.home.trim();
        const awayTeam = match.away.trim();

        if (
            homeTeam &&
            awayTeam &&
            jsonData.countries[countryName].leagues[leagueId]
        ) {
            const fixtures =
                jsonData.countries[countryName].leagues[leagueId].fixtures;
            if (!fixtures.includes(homeTeam)) {
                fixtures.push(homeTeam);
            }
            if (!fixtures.includes(awayTeam)) {
                fixtures.push(awayTeam);
            }
        }
    }
}

export default new SaveGeniusBetLeaguesWithFixturesService();
