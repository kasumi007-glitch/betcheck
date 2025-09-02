import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi as httpClientCI } from "../../../utils/HttpClientCI";
import { httpClientFromApi as httpClientSN } from "../../../utils/HttpClientSN";
import { httpClientFromApi as httpClientBJ } from "../../../utils/HttpClientBJ";

class FetchCiBetclicLeaguesService {
    // private readonly leaguesApiUrl = "https://www.betclic.ci/football-sfootball";
    // private readonly sourceName = "CI_BETCLIC";
    private sourceId!: number;
    private httpClient!: (url: string) => Promise<any>;
    private apiUrlTemplate!: string;

    private countryNameMappings: Record<string, string> = {};
    private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

    async init(sourceName: string) {
        switch (sourceName.toUpperCase()) {
            case "CI_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.ci/football-sfootball";
                this.httpClient = httpClientCI;
                break;

            case "SN_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.sn/football-sfootball";
                this.httpClient = httpClientSN;
                break;

            case "BJ_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.bj/football-sfootball";
                this.httpClient = httpClientBJ;
                break;

            default:
                throw new Error(`Unknown source: ${sourceName}`);
        }

        const source = await db("sources").where("name", sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: sourceName }).returning("id"))[0];
        await this.loadCountryNameMappings();
        await this.loadLeagueNameMappings();
    }

    async syncLeagues(sourceName: string) {
        await this.init(sourceName);
        console.log(`🚀 Fetching leagues from ${sourceName}...`);

        const response = await this.httpClient(this.apiUrlTemplate);
        const ngState = this.extractNgState(response);
        if (!ngState) return;

        const footballSport = ngState?.payload?.sports?.find((s: any) => s.sportCode === "football") ?? [];
        if (!footballSport) return;

        for (const country of footballSport?.countries ?? []) {
            if (!country.code || !country.competitions?.length) continue;

            const mappedCountry = this.countryNameMappings[country.name] ?? country.name;

            const dbCountry = await db("countries").where("name", mappedCountry).andWhere("is_active", true).first();
            if (!dbCountry) continue;

            // if (dbCountry.name !== "England") continue;

            for (const competition of country.competitions) {
                if (!competition.competitionId) continue;
                await this.processLeague(dbCountry, competition);
            }
        }

        console.log("✅ BETCLIC leagues synced successfully!");
    }

    private extractNgState(response: string): any {
        const ngStateRegex = /<script id="ng-state" type="application\/json">({.+?})<\/script>/;
        const match = response.match(ngStateRegex);
        if (!match) return null;

        try {
            const json = JSON.parse(match[1]);
            // Find the grpc response that contains sports data
            for (const key in json) {
                if (json[key]?.response?.payload?.sports) {
                    return json[key].response;
                }
            }
            return null;
        } catch (error) {
            console.error("Error parsing ng-state JSON:", error);
            return null;
        }
    }

    private async processLeague(dbCountry: any, league: any) {
        const sourceLeagueId = league.competitionId;
        const sourceLeagueName = league.competitionName;

        const mappings = this.leagueNameMappings[dbCountry.code] ?? [];
        const mappedLeague = mappings.find(m => m.mapped_name === sourceLeagueName)?.name ?? sourceLeagueName;

        const dbLeague = await db("leagues")
            .where("name", mappedLeague)
            .andWhere("country_code", dbCountry.code)
            .andWhere("is_active", true)
            .first();

        // const dbLeague = await db("leagues")
        //     .whereRaw("LOWER(name) LIKE LOWER(?)", [`%${mappedLeagueName}%`])
        //     .andWhere("country_code", dbCountry.code)
        //     .andWhere("is_active", true)
        //     .first();

        if (!dbLeague) {
            console.warn(`⚠️ No league found for: ${sourceLeagueName} in ${dbCountry.name}`);
            return;
        }

        const result = await db("source_league_matches").insert({
            source_league_id: sourceLeagueId,
            source_league_name: sourceLeagueName,
            source_country_id: dbCountry.code,
            source_country_name: dbCountry.name,
            league_id: dbLeague.id,
            country_code: dbCountry.code,
            source_id: this.sourceId,
        }).onConflict(["league_id", "source_id", "source_league_id"])
            .ignore()
            .returning("*");

        if (result.length > 0) {
            console.log(`✅ Inserted league: ${mappedLeague} (League ID: ${dbLeague.id})`);
        } else {
            console.warn(`⚠️ Duplicate league ignored: ${mappedLeague} (League ID: ${dbLeague.id})`);
        }
    }

    private mapLeagueName(originalName: string): string {
        // Convert names like "Angl. Championship" to "angl-premier-league"
        return originalName
            .toLowerCase()
            .replace(/\./g, "")
            .replace(/\s+/g, "-")
            .replace(/--/g, "-");
    }

    private async loadCountryNameMappings() {
        const mappings = await db("country_name_mappings").select("name", "mapped_name");
        this.countryNameMappings = mappings.reduce((acc, m) => ({ ...acc, [m.mapped_name]: m.name }), {});
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

export default FetchCiBetclicLeaguesService;