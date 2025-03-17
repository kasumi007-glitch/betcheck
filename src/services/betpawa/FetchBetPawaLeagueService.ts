import {db} from "../../infrastructure/database/Database";

class FetchBetPawaLeagueService {
    // Sport category 2 is football.
    private readonly apiUrl =
        "https://www.betpawa.sn/api/sportsbook/v3/categories/list/2";
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
        myHeaders.append("Cookie", process.env.COOKIE_HEADER_BETPAWA_LEAGUES ?? "");

        const requestOptions: RequestInit = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        const response = await this.fetchData(requestOptions);

        if (!response?.withRegions?.length) {
            console.warn(`⚠️ No data received from ${this.sourceName}. 1`);
            return;
        }

        if (!response?.withRegions[0].regions) {
            console.warn(`⚠️ No data received from ${this.sourceName}. 2`);
            return;
        }

        const regionalFootballData = response.withRegions[0].regions;

        for (const country of regionalFootballData) {
            if (!country.competitions?.length) {
                console.warn(`⚠️ No leagues exist for: ${country.region.name}.`);
                continue;
            }

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

        console.log(`✅ Successfully synced leagues from ${this.sourceName}!`);
    }

    private async fetchData(requestOptions: RequestInit) {
        try {
            const response = await fetch(this.apiUrl, requestOptions);
            return await response.json();
        } catch (error) {
            console.error("Error fetching data:", error);
            return;
        }
    }

    private async transformData(data: any) {
        return {
            name: data.region.name,
            id: data.region.id,
            leagues: data.competitions.map((item: SourceLeague) => ({
                id: item.competition?.id,
                name: item.competition?.name
            }))
        }
    }

    private async isolateLeagueData(country: Country): Promise<{
        external_league_id: number;
        league_name: string;
        country_name: string;
        external_country_id: number;
    }[]> {
        return country.leagues.map((league) => ({
            external_league_id: Number(league.id),
            league_name: league.name,
            country_name: country.name,
            external_country_id: Number(country.id),
        }))
    };

    private async processLeague(
        leagueName: string,
        sourceLeagueId: number,
        countryName: string,
        countryId: number
    ) {
        // Find a matching country in our db
        const country = await db("countries")
            .where("name", countryName)
            .first();

        if (!country) {
            console.warn(`⚠️ Country with external_id ${countryId} not found.`);
            return;
        }

        // Find a matching league in our db
        const league = await db("leagues")
            .where("name", leagueName)
            .andWhere("country_code", country.code)
            .first();

        // Only save if there is a matching pair that exists on both ours and the bookmaker's db
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

interface League {
    id: string;
    name: string;
}

interface Country {
    name: string;
    id: string;
    leagues: League[]
}

interface SourceLeague {
    competition: League;
}

export default new FetchBetPawaLeagueService();