import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";

class FetchCdBetikaLeaguesService {
    private readonly leaguesApiUrl = "https://api-cd.betika.com/v1/sports";
    private readonly sourceName = "CD_BETIKA";
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
        console.log("🚀 Fetching CD_BETIKA leagues...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl);
        const footballSport = response?.data?.find((s: any) => s.sport_id === "3") ?? null;
        if (!footballSport) return;

        for (const category of footballSport.categories ?? []) {
            const sourceCountryId = category.category_id;
            const countryName = this.countryNameMappings[category.category_name.trim()] ?? category.category_name.trim();

            const dbCountry = await db("countries").where("name", countryName).andWhere("is_active", true).first();
            if (!dbCountry) continue;
            // if (dbCountry.name !== "England") continue;

            for (const competition of category.competitions) {
                if (!competition.competition_id) continue;
                await this.processLeague(dbCountry, competition, sourceCountryId);
            }
        }

        console.log("✅ CD_BETIKA leagues synced successfully!");
    }

    private async processLeague(dbCountry: any, league: any, sourceCountryId: string) {
        const sourceLeagueId = league.competition_id;
        const sourceLeagueName = league.competition_name;
        const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];
        const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
        const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

        const dbLeague = await db("leagues").where("name", mappedLeagueName).andWhere("country_code", dbCountry.code).andWhere("is_active", true).first();
        if (!dbLeague) return;

        const result = await db("source_league_matches").insert({
            source_league_id: sourceLeagueId,
            source_league_name: sourceLeagueName,
            source_country_id: sourceCountryId,
            source_country_name: dbCountry.name,
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

export default FetchCdBetikaLeaguesService;