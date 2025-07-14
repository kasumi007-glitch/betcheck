import puppeteer from "puppeteer";
import { db } from "../../infrastructure/database/Database";
import { httpClientFromApi } from "../../utils/HttpClientCM";
import * as cheerio from "cheerio";

class FetchSuperGoalLeaguesService {
  private readonly websiteUrl = "https://supergooal.cm/en/betting/football";
  private readonly sourceName = "SUPERGOOAL";
  private sourceId!: number;

  private countryNameMappings: Record<string, string> = {};
  private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    await this.loadCountryNameMappings();
    await this.loadLeagueNameMappings();
  }

  async syncLeagues() {
    await this.init();
    console.log("🚀 Fetching SUPERGOOAL leagues from website...");

    const sidebarData = await this.fetchSidebarJsonFromWebsite();

    if (!sidebarData?.payload?.sports?.length) {
      console.error("❌ No league data found in sidebar JSON!");
      return;
    }

    const payload = sidebarData.payload.sports.find((sport: any) => sport.name === "Football");
    for (const region of payload.regions) {
      const countryName = region.name; // e.g., "English"
      // Apply name mapping if needed.
      const mappedCountryName = this.countryNameMappings[countryName.trim()] ?? countryName.trim();

      const dbCountry = await db("countries")
        .where("name", mappedCountryName)
        .andWhere("is_active", true)
        .first();

      if (!dbCountry) {
        console.warn(`⚠️ No match found for country: ${mappedCountryName}`);
        continue;
      }

      for (const league of region.leagues) {
        await this.processLeague(dbCountry, league);
      }
    }

    console.log("✅ SUPERGOOAL leagues synced successfully!");
  }

  private async processLeague(dbCountry: any, league: any) {
    const sourceLeagueId = league.leagueId;
    const sourceLeagueName = league.name;

    const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

    const mapping = countryLeagueMappings.find(m => m.mapped_name === sourceLeagueName);
    const mappedLeagueName = mapping ? mapping.name : sourceLeagueName;

    const dbLeague = await db("leagues")
      .where("name", mappedLeagueName)
      .andWhere("country_code", dbCountry.code)
      .first();

    if (dbLeague) {
      console.log(`✅ Matched league: ${mappedLeagueName} in ${dbCountry.name}`);

      const result = await db("source_league_matches")
        .insert({
          source_league_id: sourceLeagueId,
          source_league_name: sourceLeagueName,
          source_country_name: dbCountry.name,
          league_id: dbLeague.id,
          country_code: dbCountry.code,
          source_id: this.sourceId,
        })
        .onConflict(["league_id", "source_id", "source_league_id"])
        .ignore()
        .returning("*");

      if (result.length > 0) {
        console.log(`✅ Inserted new league mapping: ${sourceLeagueName} (DB ID: ${dbLeague.id})`);
      } else {
        console.log(`⚠️ Duplicate league mapping ignored: ${sourceLeagueName} (DB ID: ${dbLeague.id})`);
      }
    } else {
      console.warn(`⚠️ No matching league found for ${sourceLeagueName} in ${dbCountry.name}`);
    }
  }

  private async fetchSidebarJsonFromWebsite(): Promise<any | null> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.goto(this.websiteUrl, { waitUntil: "networkidle2" });

      // Wait for the script tag to be loaded
      await page.waitForSelector("#ng-state", { timeout: 10000 });

      const ngStateContent = await page.$eval("#ng-state", el => el.textContent || "");

      const ngStateJson = JSON.parse(ngStateContent);

      if (!ngStateJson.sidebar) {
        console.warn("⚠️ Sidebar not found in ng-state.");
        return null;
      }

      const sidebar = JSON.parse(ngStateJson.sidebar);
      return sidebar;
    } catch (error) {
      console.error("❌ Failed to extract sidebar using Puppeteer:", error);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async loadCountryNameMappings() {
    console.log("🔄 Loading country name mappings...");
    const mappings = await db("country_name_mappings").select("name", "mapped_name");
    this.countryNameMappings = mappings.reduce((acc, mapping) => {
      acc[mapping.mapped_name] = mapping.name;
      return acc;
    }, {} as Record<string, string>);
    console.log("✅ Country name mappings loaded.");
  }

  private async loadLeagueNameMappings() {
    console.log("🔄 Loading filtered league name mappings by country...");

    const mappings = await db("league_name_mappings as lm")
      .join("leagues as l", "lm.league_id", "=", "l.external_id")
      .join("countries as c", "l.country_code", "=", "c.code")
      .where("c.is_active", true)
      .select("lm.name", "lm.mapped_name", "l.country_code");

    this.leagueNameMappings = mappings.reduce((acc, mapping) => {
      if (!acc[mapping.country_code]) {
        acc[mapping.country_code] = [];
      }
      acc[mapping.country_code].push({
        name: mapping.name,
        mapped_name: mapping.mapped_name,
      });
      return acc;
    }, {} as Record<string, { name: string; mapped_name: string }[]>);

    console.log("✅ Filtered league name mappings categorized by country loaded.");
  }
}

export default new FetchSuperGoalLeaguesService();
