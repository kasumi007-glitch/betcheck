import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientAO";

class FetchEBetLeaguesService {
    private readonly leaguesApiUrl = "https://bitville-sports.bitville-api.com/sports/callback/tournaments?bsid=sr%3Asport%3A1&code=online-ebet-ao-sports&locale=en";
    private readonly sourceName = "AO_EBET";
    private sourceId!: number;
    private countryNameMappings: Record<string, string> = {};
    private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadCountryNameMappings();
        await this.loadLeagueNameMappings();
    }

    async syncLeagues() {
        await this.init();
        console.log("🚀 Fetching EBet leagues...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            headers: {
                "Cookie": "PHPSESSID=g0cf9ik60plpubg454fsscthob"
            }
        });

        if (!response?.countries) {
            console.warn("⚠️ No countries data received from API");
            return;
        }

        for (const country of response.countries) {
            const countryName = this.countryNameMappings[country.name.trim()] ?? country.name.trim();
            const dbCountry = await db("countries").where("name", countryName).andWhere("is_active", true).first();
            if (!dbCountry) continue;
            // if (dbCountry.name !== 'World') continue;

            await this.processTournaments(dbCountry, country.tournaments, country.id);
        }

        console.log("✅ EBet leagues synced successfully!");
    }

    private async processTournaments(dbCountry: any, tournaments: any[], sourceCountryId: string) {
        for (const tournament of tournaments) {
            const sourceLeagueId = tournament.id;
            const sourceLeagueName = tournament.name;
            const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];
            const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
            const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

            const dbLeague = await db("leagues")
                .where("name", mappedLeagueName)
                .andWhere("country_code", dbCountry.code)
                .andWhere("is_active", true).first();

            if (!dbLeague) continue;

            const result = await db("source_league_matches").insert({
                source_league_id: sourceLeagueId,
                source_league_name: sourceLeagueName,
                source_country_name: dbCountry.name,
                source_country_id: sourceCountryId, // Using the sr:category ID
                league_id: dbLeague.id,
                country_code: dbCountry.code,
                source_id: this.sourceId,
            }).onConflict(["league_id", "source_id", "source_league_id"])
                .ignore()
                .returning("*");

            if (result.length > 0) {
                console.log(`✅ Inserted league: ${mappedLeagueName} (League ID: ${dbLeague.id})`);
            } else {
                console.warn(`⚠️ Duplicate league ignored: ${mappedLeagueName} (League ID: ${dbLeague.id})`);
            }
        }
    }

    private async loadCountryNameMappings() {
        const mappings = await db("country_name_mappings").select("name", "mapped_name");
        this.countryNameMappings = mappings.reduce((acc, mapping) => {
            acc[mapping.mapped_name] = mapping.name;
            return acc;
        }, {} as Record<string, string>);
    }

    private async loadLeagueNameMappings() {
        const mappings = await db("league_name_mappings as lm")
            .join("leagues as l", "lm.league_id", "=", "l.external_id")
            .join("countries as c", "l.country_code", "=", "c.code")
            .where("c.is_active", true)
            .select("lm.name", "lm.mapped_name", "l.country_code");

        this.leagueNameMappings = mappings.reduce((acc, mapping) => {
            if (!acc[mapping.country_code]) acc[mapping.country_code] = [];
            acc[mapping.country_code].push({ name: mapping.name, mapped_name: mapping.mapped_name });
            return acc;
        }, {} as Record<string, { name: string; mapped_name: string }[]>);
    }
}

export default FetchEBetLeaguesService;