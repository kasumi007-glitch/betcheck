import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClientWithPost";
import fs from "fs";
import {EventResponse} from "../interfaces/BetPawa/EventResponse";
import {QueryObject} from "../interfaces/BetPawa/QueryObject";
import {ResponseData} from "../interfaces/BetPawa/ResponseData";

class SaveBetPawaLeaguesWithFixturesService {
    private readonly apiUrl =
        "https://www.betpawa.sn/api/sportsbook/v3/categories/list/2";
    private readonly sourceName = "BetPawa";
    private sourceId!: number;

    private readonly marketMapping: Record<number, string> = {
        3743: "1X2",
        5000: "Over / Under",
        3795: "Both Teams to Score",
    };

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
        console.log("🚀 Fetching BetPawa leagues...");

        const myHeaders = new Headers();
        myHeaders.append("accept", "*/*");
        myHeaders.append("accept-language", "en-US,en;q=0.9");
        myHeaders.append("devicetype", "web");
        myHeaders.append("priority", "u=1, i");
        myHeaders.append("referer", "https://www.betpawa.sn/");
        myHeaders.append("sec-ch-ua", "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Microsoft Edge\";v=\"134\"");
        myHeaders.append("sec-ch-ua-mobile", "?0");
        myHeaders.append("sec-ch-ua-platform", "\"Windows\"");
        myHeaders.append("sec-fetch-dest", "empty");
        myHeaders.append("sec-fetch-mode", "cors");
        myHeaders.append("sec-fetch-site", "same-origin");
        myHeaders.append("traceid", "cb12065c-e282-4d18-853c-0988e5d6b195");
        myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0");
        myHeaders.append("vuejs", "true");
        myHeaders.append("x-pawa-brand", "betpawa-senegal");
        myHeaders.append("x-pawa-language", "en");
        myHeaders.append("Cookie", process.env.COOKIE_HEADER_BETPAWA_LEAGUES ?? "");

        const requestOptions: RequestInit = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        const response = await this.fetchLeaguesData(requestOptions);

        if (!response?.withRegions?.length) {
            console.warn(`⚠️ No data received from ${this.sourceName}. 1`);
            return;
        }

        if (!response?.withRegions[0].regions) {
            console.warn(`⚠️ No data received from ${this.sourceName}. 2`);
            return;
        }

        let jsonData: any = {countries: {}};
        
        const regionalFootballData = response.withRegions[0].regions;

        for (const country of regionalFootballData) {
            if (!country.competitions?.length) {
                console.warn(`⚠️ No leagues exist for: ${country.region.name}.`);
                continue;
            }
            await this.processCountry(country, jsonData);
        }
        
        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        fs.writeFileSync(
            "betpawa_leagues_fixtures.json",
            JSON.stringify(jsonData, null, 2)
        );
        console.log("✅ JSON file generated: betpawa_leagues_fixtures.json");
    }

    private async fetchFixturesData(apiUrl: string, requestOptions: RequestInit) {
        try {
            const response = await fetch(apiUrl, requestOptions);
            return response.json();
        } catch (error) {
            console.error("Error fetching data:", error);
            return;
        }
    }

    private async fetchLeaguesData(requestOptions: RequestInit) {
        try {
            const response = await fetch(this.apiUrl, requestOptions);
            return await response.json();
        } catch (error) {
            console.error("Error fetching data:", error);
            return;
        }
    }

    private async processCountry(country: any, jsonData: any) {
        const countryId = country.region.id;
        const countryName = country.region.name;
        console.log(`🌍 Processing country: ${countryName}`);

        jsonData.countries[countryName] = {leagues: {}};

        if (country.competitions) {
            for (const league of country.competitions) {
                await this.processLeague(league, jsonData, countryName);
            }
        }
    }

    private async processLeague(league: any, jsonData: any, countryName: string) {
        const leagueId = league.competition.id;
        const leagueName = league.competition.name;
        console.log(`⚽ Processing league: ${leagueName} in ${countryName}`);

        jsonData.countries[countryName].leagues[leagueId] = {
            name: leagueName,
            fixtures: [],
        };
        const marketTypeIds = Object.keys(this.marketMapping);

        for (const marketTypeId of marketTypeIds) {
            await this.fetchAndProcessFixtures(leagueId, jsonData, countryName, marketTypeId);
        }
    }

    private async fetchAndProcessFixtures(
        leagueId: number,
        jsonData: any,
        countryName: string,
        marketTypeId: string
    ) {
        const marketName = this.marketMapping[Number(marketTypeId)];

        const fixtures = await this.fetchAllFixtures(marketName, marketTypeId);

        for (const fixture of fixtures) {
            this.processMatch(fixture, leagueId, jsonData, countryName);
        }
    }

    private async fetchAllFixtures(marketName: string, marketTypeId: string): Promise<EventResponse[]> {
        const myHeaders = new Headers();
        myHeaders.append("accept", "*/*");
        myHeaders.append("accept-language", "en-US,en;q=0.9");
        myHeaders.append("devicetype", "web");
        myHeaders.append("priority", "u=1, i");
        myHeaders.append("referer", `https://www.betpawa.sn/events?marketId=${marketName}&categoryId=2`);
        myHeaders.append("sec-ch-ua", "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Microsoft Edge\";v=\"134\"");
        myHeaders.append("sec-ch-ua-mobile", "?0");
        myHeaders.append("sec-ch-ua-platform", "\"Windows\"");
        myHeaders.append("sec-fetch-dest", "empty");
        myHeaders.append("sec-fetch-mode", "cors");
        myHeaders.append("sec-fetch-site", "same-origin");
        myHeaders.append("traceid", "cb12065c-e282-4d18-853c-0988e5d6b195");
        myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0");
        myHeaders.append("vuejs", "true");
        myHeaders.append("x-pawa-brand", "betpawa-senegal");
        myHeaders.append("x-pawa-language", "en");
        myHeaders.append("Cookie", process.env.COOKIE_HEADER_BETPAWA_FIXTURES_WITH_ODDS ?? "");

        const requestOptions: RequestInit = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        const eventTypeName = "UPCOMING";
        const sportId = ["2"]; // Football.
        const take = 100; // Max is 100.

        let skip = 0;
        let hasMoreData = true;
        let allFixtures: EventResponse[] = [];

        while (hasMoreData) {
            const queryObject: QueryObject = {
                queries: [
                    {
                        query: {
                            eventType: eventTypeName,
                            categories: sportId,
                            zones: {},
                            hasOdds: true
                        },
                        view: {
                            marketTypes: [marketTypeId]
                        },
                        skip: skip,
                        take: take
                    }
                ]
            };

            const apiUrl = `https://www.betpawa.sn/api/sportsbook/v2/events/lists/by-queries?q=${encodeURIComponent(JSON.stringify(queryObject))}`;

            try {
                const response: ResponseData = await this.fetchData(apiUrl, requestOptions);

                if (!response?.responses?.length) {
                    console.warn(`⚠️ No more fixtures received for market type ${marketName}, ID: ${marketTypeId}`);
                    hasMoreData = false;
                    break;
                }

                // Accumulate data
                response.responses.forEach((res) => {
                    allFixtures = allFixtures.concat(res.responses);
                });

                // Check if we got less than `take`, meaning no more pages
                if (response.responses[0].responses.length < take) {
                    hasMoreData = false;
                } else {
                    skip += take;
                }
            } catch (error) {
                console.error("Error fetching fixtures:", error);
                hasMoreData = false;
            }
        }

        return allFixtures;
    }

    private async fetchData(apiUrl: string, requestOptions: RequestInit) {
        try {
            const response = await fetch(apiUrl, requestOptions);
            return response.json();
        } catch (error) {
            console.error("Error fetching data:", error);
            return;
        }
    }

    private processMatch(
        match: any,
        leagueId: number,
        jsonData: any,
        countryName: string
    ) {
        const homeTeam = match.participants[0]?.name?.trim();
        const awayTeam = match.participants[1]?.name?.trim();

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

export default new SaveBetPawaLeaguesWithFixturesService();
