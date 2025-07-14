import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../utils/HttpClientCI";

class Fetch1WinProLeagueService {
    private readonly countriesApiUrl = "https://api-gateway.top-parser.com/categories/get-many";
    private readonly leaguesApiUrl = "https://api-gateway.top-parser.com/tournaments/get-many";
    private sourceId!: number;
    private readonly SOURCE_NAME = "1WINPRO";
    private countryNameMappings: Record<string, string> = {};
    private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.SOURCE_NAME).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.SOURCE_NAME }).returning("id"))[0];
        await this.loadCountryNameMappings();
        await this.loadLeagueNameMappings();
    }

    async syncLeagues() {
        await this.init();
        console.log("🚀 Fetching TopParser leagues...");

        const countryRes = await fetchFromApiWithoutProxy(this.countriesApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-lang": "en-001" },
            data: JSON.stringify({ service: "PREMATCH", sportId: 18 }),
        });

        const countries = countryRes?.result?.items ?? [];
        for (const item of countries) {
            const category = item.category;
            if (!category) continue;
            // if (category.name !== 'Spain') continue;

            const categoryId = category.id;
            const countryName = this.countryNameMappings[category.name.trim()] ?? category.name.trim();
            const dbCountry = await db("countries").where("name", countryName).andWhere("is_active", true).first();
            if (!dbCountry) continue;

            const leagueRes = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-lang": "en-001" },
                data: JSON.stringify({ service: "PREMATCH", sportId: 18, categoryId }),
            });

            const leagues = leagueRes?.result?.items ?? [];
            for (const item of leagues) {
                const league = item.tournament;
                if (!league) continue;

                const sourceLeagueId = league.id;
                const sourceLeagueName = league.name;
                const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];
                const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
                const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

                const dbLeague = await db("leagues").where("name", mappedLeagueName).andWhere("country_code", dbCountry.code).andWhere("is_active", true).first();
                if (!dbLeague) continue;

                const result = await db("source_league_matches")
                    .insert({
                        source_league_id: sourceLeagueId,
                        source_league_name: sourceLeagueName,
                        source_country_name: dbCountry.name,
                        source_country_id: categoryId,
                        league_id: dbLeague.id,
                        country_code: dbCountry.code,
                        source_id: this.sourceId,
                    })
                    .onConflict(["league_id", "source_id", "source_league_id"])
                    .ignore()
                    .returning("*");

                if (result.length > 0) {
                    console.log(`✅ Inserted league: ${mappedLeagueName}`);
                } else {
                    console.warn(`⚠️ Ignored duplicate league: ${mappedLeagueName}`);
                }
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

export default Fetch1WinProLeagueService;