import puppeteer from "puppeteer";
import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi, fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";

class FetchCdWinnerBetLeaguesService {
    private readonly leaguesApiUrl = "https://winner.bet/services/evapi/event/GetSportsTree?statusId=0&eventTypeId=0";
    private readonly sourceName = "CD_WINNERBET";
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
        console.log("🚀 Fetching CD Winner bet leagues...");

        // const data = await fetchEventData();
        const response = await httpClientFromApi(this.leaguesApiUrl, {
            headers: {
                'terminal': 'winner.bet'
            }
        });

        if (!response?.data?.cl) {
            console.error("❌ No sports data found in response");
            return;
        }

        // Find soccer sport
        const soccerSport = response.data.cl.find((sport: any) =>
            sport.n === "Soccer"
        );

        if (!soccerSport) {
            console.error("❌ Soccer sport not found");
            return;
        }

        for (const category of soccerSport.cl || []) {
            const categoryName = category.n;
            if (!categoryName) continue;

            // Try to find country based on category name
            const mappedCountryName = this.countryNameMappings[categoryName] || categoryName;
            const dbCountry = await db("countries").where("name", mappedCountryName).andWhere("is_active", true).first();
            if (!dbCountry) continue;
            // if (dbCountry.name !== 'England') continue;

            for (const tournament of category.cl || []) {
                await this.processLeague(dbCountry, categoryName, tournament, category.id);
            }
        }

        console.log("✅ CD Winner bet leagues synced successfully!");
    }

    private async processLeague(dbCountry: any, categoryName: string, tournament: any, sourceCategoryId: string) {
        const sourceLeagueId = tournament.id;
        const sourceLeagueName = tournament.n;

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
            source_country_id: sourceCategoryId,
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

export default FetchCdWinnerBetLeaguesService;