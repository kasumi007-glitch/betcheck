import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClient";

class FetchGeniusBetLeagueService {
    private readonly apiUrl =
        "https://api.geniusbet.com.gn/api/v2/side-bar";
    private readonly sourceName = "GENIUSBET";
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
        const response = await fetchFromApi(this.apiUrl);

        if (!response?.data?.sidebar?.matches?.length) {
            console.warn(`⚠️ No data received from ${this.sourceName}.`);
            return;
        }

        const matches = response.data.sidebar.matches;

        for (const match of matches) {
            if (match.name === "Soccer") {
                if (!match.categories) continue; // Skip if no leagues exist
                const categories = match.categories;

                const countryData = await this.transformData(categories);

                for (const country of countryData) {
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

    private async transformData(data: Array<any>) {
        return data.map(country => ({
            name: country.name,
            id: country.id,
            tournaments: country.tournaments.map((tournament: { id: any; name: any; }) => ({
                id: tournament.id,
                name: tournament.name
            }))
        }));
    }

    private async isolateLeagueData(country: { name: any; id: any; tournaments: any }): Promise<any> {
        return country.tournaments.map((tournament: { id: any; name: any; }) => ({
            external_league_id: tournament.id,
            league_name: tournament.name,
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
                `✅ Matched league: ${leagueName} (Source: ${leagueName}) for ${country.name}`
            );

            const result = await db("source_league_matches")
                .insert({
                    source_league_id: sourceLeagueId,
                    source_league_name: leagueName,
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
                    `✅ Inserted new league: ${leagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
                );
            } else {
                console.warn(
                    `⚠️ Ignored duplicate league: ${leagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
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

export default new FetchGeniusBetLeagueService();
