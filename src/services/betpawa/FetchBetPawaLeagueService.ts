import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClient";
import {leagueNameMappings} from "../leagueNameMappings";
import dotenv from "dotenv";

class FetchBetPawaLeagueService {
    private readonly apiUrl =
        "https://www.betpawa.sn/api/sportsbook/v3/categories/list/2"; // Category 2 is football.
    private readonly sourceName = "BetPawa";
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

// Skip 0; take 100 - skip 100; take 100 -  until current.length = 0 then stop
    async syncLeagues() {
        console.log(`🚀 Fetching leagues data from ${this.sourceName}...`);

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
        myHeaders.append("Cookie", process.env.COOKIE ?? "");

        const requestOptions: RequestInit = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        const response = await this.fetchData(requestOptions);

        console.log(response, 'response')
        if (!response?.withRegions?.length) {
            console.warn(`⚠️ No data received from ${this.sourceName}.`);
            return;
        }

        const countryData = response.withRegions;

        for (const datum of countryData) {
            if (!datum.regions?.length) continue; // Skip if no leagues exist
            for (const country of datum.regions) {
                const countryData = await this.transformData(country);
                const leagueData = await this.isolateLeagueData(countryData);

                for (const leagueDatum of leagueData) {
                    await this.processLeague(
                        leagueDatum.league_name,
                        leagueDatum.external_league_id,
                        leagueDatum.country_name,
                        leagueDatum.external_country_id
                    );
                }
            }
        }

        console.log(`✅ Successfully synced leagues from ${this.sourceName}!`);
    }

    private async fetchData(requestOptions: RequestInit) {
        try {
            const response = await fetch("https://www.betpawa.sn/api/sportsbook/v3/categories/list/2", requestOptions);
            const result = await response.json();
            return result;
        } catch (error) {
            console.error("Error fetching data:", error);
            return;
        }
    }

    private async transformData(data: any) {
        return {
            name: data.region.name,
            id: data.region.id,
            leagues: data.competitions.map((item: { competition: { id: any; name: any } }) => ({
                id: item.competition?.id,
                name: item.competition?.name
            }))
        }
    }

    private async isolateLeagueData(country: { name: any; id: any; leagues: any }): Promise<any> {
        return country.leagues.map((league: { id: any; name: any; }) => ({
            external_league_id: league.id,
            league_name: league.name,
            country_name: country.name,
            external_country_id: country.id,
        }))
    };

    private async processLeague(
        leagueName: string,
        sourceLeagueId: number,
        countryName: string,
        countryId: number
    ) {
        // Find country by country code
        const country = await db("countries")
            .where("name", countryName)
            .first();
        if (!country) {
            console.warn(`⚠️ Country with external_id ${countryId} not found.`);
            return;
        }

        // Find a matching league in our database
        const league = await db("leagues")
            .where("name", leagueName)
            .andWhere("country_code", country.code)
            .first();

        if (league) {
            console.log(
                `✅ Matched league: ${league.name} (Source: ${league.name}) for ${country.name}`
            );
            const result = await db("source_league_matches")
                .insert({
                    source_league_id: sourceLeagueId,
                    source_league_name: league.name,
                    source_country_name: country.name,
                    league_id: league.id,
                    country_code: country.code,
                    source_id: this.sourceId,
                })
                .onConflict(["league_id", "source_id"])
                .ignore() // This prevents duplicate inserts
                .returning("*"); // Returns the inserted row(s) if successful

            // Check if insert was successful or ignored
            if (result.length > 0) {
                console.log(
                    `✅ Inserted new league: ${league.name} (League ID: ${league.id}, Source: ${this.sourceId})`
                );
            } else {
                console.warn(
                    `⚠️ Ignored duplicate league: ${league.name} (League ID: ${league.id}, Source: ${this.sourceId})`
                );
            }
        } else {
            console.warn(
                `⚠️ No match found for league: ${leagueName} (Source: ${leagueName}) in country: ${country.name}`
            );
        }
    }
}

export default new FetchBetPawaLeagueService();
