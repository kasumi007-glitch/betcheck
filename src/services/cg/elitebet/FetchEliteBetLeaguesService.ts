import fs from "fs";
import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCG";
import { parse } from 'node-html-parser';
import { console } from "inspector";

class FetchEliteBetLeaguesService {
    private readonly leaguesApiUrl = "https://elitebet.cg/?view=sport&sport=Sport_Football&s=coupons";
    private readonly sourceName = "CG_ELITEBET";
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
        console.log("🚀 Fetching EliteBet leagues...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "en-US,en;q=0.9",
                "Connection": "keep-alive"
            }
        });

        const html = parse(response);
        const azList = html.querySelector('#AZ.LIST');
        if (!azList) {
            console.warn("❌ AZ list not found");
            return;
        }

        const listContent = azList.querySelector('.LIST_CONTENT');
        if (!listContent) {
            console.warn("❌ LIST_CONTENT not found");
            return;
        }

        let currentCountry = "";
        let dbCountry: any = null;

        // Get all child nodes and filter for element nodes
        for (const child of listContent.childNodes) {
            // Check if it's an element node
            if (child.nodeType === 1) {
                const element = child as unknown as HTMLElement;
                const classAttr = element.getAttribute('class') || '';
                const classes = classAttr.split(' ');

                if (classes.includes('AZ_group')) {
                    // This is a country/group
                    currentCountry = element.textContent?.trim() || '';
                    const mappedCountryName = this.countryNameMappings[currentCountry] || currentCountry;
                    dbCountry = await db("countries").where("name", mappedCountryName).andWhere("is_active", true).first();

                    if (!dbCountry) {
                        currentCountry = ""; // Reset if country not found in DB
                        continue;
                    }
                }
                else if (classes.includes('AZ_competitions_wrapper') && currentCountry && dbCountry) {
                    // This is a competitions wrapper for the current country
                    const competitionElements = element.querySelectorAll('.AZ_competition');
                    for (const competition of competitionElements) {
                        await this.processLeague(dbCountry, competition);
                    }
                }
            }
        }

        console.log("✅ EliteBet leagues synced successfully!");
    }

    private async processLeague(dbCountry: any, competition: any) {
        const onclickAttr = competition.getAttribute('onclick');
        if (!onclickAttr) return;

        const competitionIdMatch = onclickAttr.match(/competition=(\d+)/);
        if (!competitionIdMatch) return;

        const sourceLeagueId = competitionIdMatch[1];
        const sourceLeagueName = competition.querySelector('td')?.text.trim();
        if (!sourceLeagueName) return;

        console.log(`⚽ Processing league: ${sourceLeagueName}`);

        const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];
        const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
        const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

        const dbLeague = await db("leagues").where("name", mappedLeagueName)
            .andWhere("country_code", dbCountry.code)
            .andWhere("is_active", true)
            .first();

        if (!dbLeague) {
            console.warn(`⚠️ League not found in DB for: ${sourceLeagueName})`);
            return
        };

        // Get source country ID from wrapper ID
        const wrapper = competition.parentNode;
        const sourceCountryIdMatch = wrapper.id.match(/AZ_competitions_wrapper_(\d+)/);
        const sourceCountryId = sourceCountryIdMatch ? sourceCountryIdMatch[1] : null;

        const result = await db("source_league_matches").insert({
            source_league_id: sourceLeagueId,
            source_league_name: sourceLeagueName,
            source_country_name: dbCountry.name,
            source_country_id: sourceCountryId,
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

export default FetchEliteBetLeaguesService;