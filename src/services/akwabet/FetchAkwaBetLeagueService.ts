import { db } from "../../infrastructure/database/Database";
// import { httpClientFromApi } from "../../utils/ApiClientAkwaBet";
import { httpClientFromApi,fetchFromApiWithoutProxy } from "../../utils/HttpClientCI";
// import { tunnelClientFromApi } from "../../utils/tunnelClientCI";

class FetchAkwaBetLeagueService {
    private readonly apiUrl =
        "https://api.logiqsport.com:60009/api/pregame/getPregameData?providerId=1&h24=false&lang=en&siteid=43";
    private readonly sourceName = "AKWABET";
    private sourceId!: number;
    private countryNameMappings: Record<string, string> = {};
    private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({ name: this.sourceName })
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
        const response = await httpClientFromApi(this.apiUrl);

        if (!response?.Sports?.length) {
            console.warn(`⚠️ No data received from ${this.sourceName}.`);
            return;
        }

        for (const sport of response.Sports) {
            if (sport.Name?.International === "Football") {
                if (!sport.Categories) continue; // Skip if no categories exist

                for (const data of sport.Categories) {
                    const country = await this.transformData(data);
                    const leagueData = await this.isolateLeagueData(country);

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
        }

        console.log(`✅ Successfully synced leagues from ${this.sourceName}!`);
    }

    private async transformData(data: any) {
        return {
            name: data.Name.International,
            id: data.Id,
            leagues: data.Tournaments.map((tournament: { Id: any; Name: { International: any }; }) => ({
                id: tournament.Id,
                name: tournament.Name.International
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
        sourceCountryName: string,
        countryId: number
    ) {
        const countryName = this.countryNameMappings[sourceCountryName.trim()] ?? sourceCountryName.trim();

        // Find country by country code
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

        // Find a matching league in our database
        const league = await db("leagues")
            .where("name", mappedLeagueName)
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
                    source_country_id: countryId,
                    league_id: league.id,
                    country_code: country.code,
                    source_id: this.sourceId,
                })
                .onConflict(["league_id", "source_id","source_league_id"])
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

export default new

    FetchAkwaBetLeagueService();
