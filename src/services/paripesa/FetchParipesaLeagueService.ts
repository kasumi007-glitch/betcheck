import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClient";
import {leagueNameMappings} from "../leagueNameMappings";

class FetchParipesaLeagueService {
    private readonly apiUrl =
        "https://paripesa.top/service-api/LineFeed/GetSportsShortZip?sports=1&lng=en&country=214&partner=188&virtualSports=true&gr=764&groupChamps=true";
    private readonly sourceName = "Paripesa";
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
        await this.init();

        console.log(`🚀 Fetching leagues data from ${this.sourceName}...`);
        const response = await fetchFromApi(this.apiUrl);

        if (!response?.Value?.length) {
            console.warn(`⚠️ No data received from ${this.sourceName}.`);
            return;
        }

        for (const sport of response.Value) {
            if (!sport.L) continue; // Skip if no leagues exist

            for (const leagueData of sport.L) {
                if (leagueData.SC) {
                    for (const subLeague of leagueData.SC) {
                        await this.processLeague(
                            subLeague.L,
                            subLeague.LI,
                            leagueData.L,
                            leagueData.CI
                        );
                    }
                } else {
                    await this.processLeague(
                        leagueData.L,
                        leagueData.LI,
                        null,
                        leagueData.CI
                    );
                }
            }
        }

        console.log(`✅ Successfully synced leagues from ${this.sourceName}!`);
    }

    private async processLeague(
        leagueName: string,
        sourceLeagueId: number,
        parentLeagueName: string | null,
        countryId: number
    ) {
        if (!leagueName.includes(".")) {
            console.warn(
                `⚠️ Skipping league "${leagueName}" - No dot separator found.`
            );
            return;
        }

        // Extract country name & actual league name
        const leagueParts = leagueName.split(".");
        if (leagueParts.length > 2) {
            console.warn(
                `⚠️ Skipping league "${leagueName}" - Too many dot separators.`
            );
            return;
        }
        const extractedLeagueName =
            leagueParts.length > 1 ? leagueParts[1].trim() : leagueName;

        let sourceCountryName =
            leagueParts.length > 1 ? leagueParts[0].trim() : leagueName;

        if (sourceCountryName == "USSR") {
            sourceCountryName = "Russia";
        }

        // Find country by country code
        const country = await db("countries")
            .where("name", sourceCountryName)
            .andWhere("is_active", true)
            .first();
        if (!country) {
            console.warn(`⚠️ Country with external_id ${countryId} not found.`);
            return;
        }

        // Find a matching league in our database
        const league = await db("leagues")
            .where("name", extractedLeagueName)
            .andWhere("country_code", country.code)
            .first();

        if (league) {
            console.log(
                `✅ Matched league: ${extractedLeagueName} (Source: ${leagueName}) for ${country.name}`
            );

            const result = await db("source_league_matches")
                .insert({
                    source_league_id: sourceLeagueId,
                    source_league_name: extractedLeagueName,
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
                    `✅ Inserted new league: ${extractedLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
                );
            } else {
                console.warn(
                    `⚠️ Ignored duplicate league: ${extractedLeagueName} (League ID: ${league.id}, Source: ${this.sourceId})`
                );
            }
        } else {
            console.warn(
                `⚠️ No match found for league: ${extractedLeagueName} (Source: ${leagueName}) in country: ${country.name}`
            );
        }
    }
}

export default new FetchParipesaLeagueService();
