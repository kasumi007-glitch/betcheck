import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientAO";
import { parse } from 'node-html-parser';

class Fetch888BetsLeaguesService {
    private readonly leaguesApiUrl = "https://888bets.co.ao/sportspage/allleaguestab?sportname=football";
    private readonly sourceName = "AO_888BET";
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
        console.log("🚀 Fetching 888Bets leagues...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            method: "GET",
            headers: {
                "Cookie": "UserCulture=en-US"
            }
        });

        const html = parse(response.sportsAllLeagues);
        const countryAccordions = html.querySelectorAll('.SB-countryAccordion');

        for (const countryAcc of countryAccordions) {
            const countryHeader = countryAcc.querySelector('.SB-countryAccordion-header');
            const countryName = countryHeader?.querySelector('.SB-sidePanelList-item-content a')?.text.trim();
            if (!countryName) continue;

            const mappedCountryName = this.countryNameMappings[countryName] || countryName;
            const dbCountry = await db("countries").where("name", mappedCountryName).andWhere("is_active", true).first();
            if (!dbCountry) continue;
            // if (dbCountry.name !== 'World') continue;

            const leagueItems = countryAcc.querySelectorAll('.SB-sidePanelList-leagueItem');
            for (const leagueItem of leagueItems) {
                await this.processLeague(dbCountry, leagueItem, countryName);
            }
        }

        console.log("✅ 888Bets leagues synced successfully!");
    }

    private async processLeague(dbCountry: any, leagueItem: any, sourceCountryName: string) {
        const leagueName = leagueItem
            .childNodes
            .filter((node: any) => node.nodeType === 3) // Keep only text nodes
            .map((node: any) => node.rawText.trim())    // Trim whitespace
            .find((text: any) => text.length > 0) || ''; // Get first non-empty

        const sourceLeagueId = leagueItem.getAttribute('[data-leagueid]') ||
            leagueItem.getAttribute('data-leagueid') ||
            leagueItem.id.replace('getleagueId_', '');

        if (!sourceLeagueId) {
            console.warn(`⚠️ No league ID found for league: ${leagueName}`);
            return;
        }

        const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];
        const mapping = countryLeagueMappings.find(m => m.mapped_name === leagueName);
        const mappedLeagueName = mapping ? mapping.name : leagueName;

        const dbLeague = await db("leagues").where("name", mappedLeagueName)
            .andWhere("country_code", dbCountry.code)
            .andWhere("is_active", true)
            .first();

        if (!dbLeague) return;

        const result = await db("source_league_matches").insert({
            source_league_id: sourceLeagueId,
            source_league_name: leagueName,
            source_country_name: sourceCountryName,
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

export default Fetch888BetsLeaguesService;