import {db} from "../../infrastructure/database/Database";
import {SourceLeague} from "../interfaces/BetPawa/SourceLeague";
import {Country} from "../interfaces/BetPawa/Country";

class FetchBetPawaLeagueService {
    // Sport category 2 is football.
    private readonly apiUrl =
        "https://www.betpawa.sn/api/sportsbook/v3/categories/list/2";
    private readonly sourceName = "BETPAWA";
    private sourceId!: number;
    private countryNameMappings: Record<string, string> = {};
    private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({name: this.sourceName})
                .returning("id");
        } else {
            this.sourceId = source.id;
        }

        await this.loadCountryNameMappings();
        await this.loadLeagueNameMappings();
    }

    async syncLeagues() {
        await this.init();
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
        sourceCountryName: string,
        countryId: number
    ) {
        const countryName = this.countryNameMappings[sourceCountryName.trim()] ?? sourceCountryName.trim();

        // Find a matching country in our db
        const country = await db("countries")
            .where("name", countryName)
            .andWhere("is_active", true)
            .first();

        if (!country) {
            console.warn(`⚠️ Country with external_id ${countryId} not found.`);
            return;
        }

        // Get all league mappings for this specific country
        const countryLeagueMappings = this.leagueNameMappings[country.code] || [];

        // Find the mapped league name if available
        const mapping = countryLeagueMappings.find(m => m.mapped_name === leagueName);
        const mappedLeagueName = mapping ? mapping.name : leagueName;

        // Find a matching league in our db
        const league = await db("leagues")
            .where("name", mappedLeagueName)
            .andWhere("country_code", country.code)
            .first();

        // Only save if there is a matching pair that exists on both ours and the source's db
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

    private async loadCountryNameMappings() {
        console.log("🔄 Loading country name mappings...");
        const mappings = await db("country_name_mappings").select("name", "mapped_name");
        this.countryNameMappings = mappings.reduce((acc, mapping) => {
            acc[mapping.mapped_name] = mapping.name;
            return acc;
        }, {} as Record<string, string>);
        console.log("✅ Country name mappings loaded.");
    }

    private async loadLeagueNameMappings() {
        console.log("🔄 Loading filtered league name mappings by country...");

        const mappings = await db("league_name_mappings as lm")
            .join("leagues as l", "lm.league_id", "=", "l.external_id")
            .join("countries as c", "l.country_code", "=", "c.code")
            .where("c.is_active", true) // Ensure country is active
            .select("lm.name", "lm.mapped_name", "l.country_code");

        // Group league mappings by country and store as an array
        this.leagueNameMappings = mappings.reduce((acc, mapping) => {
            if (!acc[mapping.country_code]) {
                acc[mapping.country_code] = []; // Initialize an empty array for each country
            }
            acc[mapping.country_code].push({
                name: mapping.name,
                mapped_name: mapping.mapped_name
            });
            return acc;
        }, {} as Record<string, { name: string; mapped_name: string }[]>);

        console.log("✅ Filtered league name mappings categorized by country loaded.");
    }
}

export default new FetchBetPawaLeagueService();