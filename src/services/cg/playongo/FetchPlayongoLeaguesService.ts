import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi } from "../../../utils/HttpClientCG";

class FetchPlayongoLeaguesService {
    private readonly leaguesApiUrl = "https://prod-api.velisports.com/sportsbookwebsitewebapi/WebSite/GetPrematchTree?SportId=1&CurrencyId=CDF&LanguageId=en&PartnerId=2&PartnerName=paridirect&TimeZone=3";
    private readonly sourceName = "CG_PLAYONGO";
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
        console.log("🚀 Fetching Playongo leagues...");

        const response = await httpClientFromApi(this.leaguesApiUrl);

        if (!response?.Ss?.length) {
            console.warn("⚠️ No sports data found in response");
            return;
        }

        // Find football sport (SI: 1)
        const footballSport = response.Ss.find((sport: any) => sport.SI === 1);
        if (!footballSport) {
            console.warn("⚠️ Football sport not found in API response");
            return;
        }

        for (const region of footballSport.Rs || []) {
            const countryName = region.RN;
            if (!countryName) continue;

            const mappedCountryName = this.countryNameMappings[countryName] || countryName;
            const dbCountry = await db("countries").where("name", mappedCountryName).andWhere("is_active", true).first();
            if (!dbCountry) continue;
            // if (dbCountry.name !== 'World') continue;

            for (const competition of region.Cs || []) {
                await this.processLeague(dbCountry, competition, region.RI);
            }
        }

        console.log("✅ Playongo leagues synced successfully!");
    }

    private async processLeague(dbCountry: any, competition: any, regionId: number) {
        const sourceLeagueId = competition.CI;
        const sourceLeagueName = competition.CN;

        if (!sourceLeagueId || !sourceLeagueName) return;

        const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];
        const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
        const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

        const dbLeague = await db("leagues").where("name", mappedLeagueName)
            .andWhere("country_code", dbCountry.code)
            .andWhere("is_active", true)
            .first();

        if (!dbLeague) return;

        const result = await db("source_league_matches").insert({
            source_league_id: sourceLeagueId,
            source_league_name: sourceLeagueName,
            source_country_name: dbCountry.name,
            source_country_id: regionId, // Using region ID as country ID
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

export default FetchPlayongoLeaguesService;