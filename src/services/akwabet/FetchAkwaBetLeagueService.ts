import {db} from "../../infrastructure/database/Database";
import {fetchFromApi} from "../../utils/ApiClientAkwaBet";
import {leagueNameMappings} from "../leagueNameMappings";

class FetchAkwaBetLeagueService {
    private readonly apiUrl =
        "https://api.logiqsport.com:60009/api/pregame/getPregameData?providerId=1&h24=false&lang=en&siteid=43";
    private readonly sourceName = "AkwaBet";
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
        countryName: string,
        countryId: number
    ) {
        // Find country by country code
        const country = await db("countries")
            .where("name", countryName)
            .andWhere("is_active", true)
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

export default new

FetchAkwaBetLeagueService();
