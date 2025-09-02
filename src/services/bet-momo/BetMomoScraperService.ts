import { launchBrowserWithProxy } from "../../utils/launchBrowserUtilAll";
import { launchBrowserWithProxy as launchBrowserWithProxyAO, launchBrowserWithoutProxy } from "../../utils/launchBrowserUtilAO";
import { launchBrowserWithProxy as launchBrowserWithProxyCI } from "../../utils/launchBrowserUtilCI";
import { launchBrowserWithProxy as launchBrowserWithProxySL } from "../../utils/launchBrowserUtilSL";
import { launchBrowserWithProxy as launchBrowserWithProxyZW } from "../../utils/launchBrowserUtilZW";
import { Page, ElementHandle, JSHandle, Browser } from "puppeteer";
import { db } from "../../infrastructure/database/Database";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { httpClientFromApi as httpClientAO } from "../../utils/HttpClientAO";
import { httpClientFromApi as httpClientCI } from "../../utils/HttpClientCI"; //same as CM
import { httpClientFromApi as httpClientSL } from "../../utils/HttpClientSL";
import { httpClientFromApi as httpClientZW } from "../../utils/HttpClientZW";
import fs from "fs";
import path from "path";
import { OddsSnapshotService } from "../../utils/OddsSnapshotService";

interface MatchInfo {
  teams: string[];
  time: string;
  date: string;
}

interface OddsData {
  matchResult?: { home: string; draw: string; away: string };
  bothTeams?: { yes: string; no: string };
  totalGoals?: { over: string; under: string };
  external_source_fixture_id?: number;
}

interface Match {
  country: string;
  league: string;
  basicInfo: MatchInfo;
  odds: OddsData;
}

class BetMomoScraperService {
  // ----- Odds mapping configuration -----
  private readonly groupMapping: Record<string, string> = {
    "1x2": "1X2",
    "Both Teams To Score": "Both Teams to Score",
    Total: "Over / Under",
  };

  private readonly outcomeNameNewMapping: Record<string, string> = {
    "1": "1",
    x: "X",
    "2": "2",
    total_over__2_5: "Over",
    total_under_2_5: "Under",
    yes: "Yes",
    no: "No",
  };

  private dbGroups: Group[] = [];
  private dbMarkets: Market[] = [];
  // private readonly sourceName = "BETMOMO";
  private httpClient!: (url: string) => Promise<any>;
  private launchBrowserWithProxy!: (headless: boolean) => Promise<{
    browser: Browser;
    page: Page;
  }>;
  private apiUrlTemplate!: string;
  private sourceId!: number;
  private countryNameMappings: Record<string, string> = {};
  private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};
  private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};
  // ----- End Odds mapping configuration -----

  async init(sourceName: string) {
    switch (sourceName.toUpperCase()) {
      case "AOMOBET":
        this.apiUrlTemplate =
          "https://www.mobet.ao/en/sports/pre-match/event-view/Soccer";
        this.launchBrowserWithProxy = launchBrowserWithProxyAO;
        break;
      case "AOAFRIBET":
        this.apiUrlTemplate =
          "https://www.afribet.ao/en/sports/pre-match/event-view/Soccer";
        this.launchBrowserWithProxy = launchBrowserWithProxyAO;
        break;
      case "AOELEPHANTBET":
        this.apiUrlTemplate =
          "https://www.elephantbet.co.ao/en/sports/pre-match/event-view/Soccer";
        this.launchBrowserWithProxy = launchBrowserWithProxyAO;
        break;
      case "AOBANTUBET":
        this.apiUrlTemplate =
          "https://www.bantubet.co.ao/en/sports/pre-match/event-view/Soccer";
        this.launchBrowserWithProxy = launchBrowserWithProxyAO;
        break;
      case "BETMOMO":
        this.apiUrlTemplate =
          "https://www.betmomo.com/en/sports/pre-match/event-view/Soccer";
        this.launchBrowserWithProxy = launchBrowserWithProxyCI;
        break;
      case "SLELEPHANTBET":
        this.apiUrlTemplate =
          "https://www.elephantbet.sl/en/sports/pre-match/event-view/Soccer";
        this.launchBrowserWithProxy = launchBrowserWithProxySL;
        break;

      case "ZWAFRICABET":
        this.apiUrlTemplate =
          "https://www.africabet.com/en/sports/pre-match/event-view/Soccer";
        this.launchBrowserWithProxy = launchBrowserWithProxyZW;
        break;

      default:
        throw new Error(`Unknown source: ${sourceName}`);
    }
    const source = await db("sources").where("name", sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }

    await this.loadCountryNameMappings();
    await this.loadLeagueNameMappings();
    await this.loadTeamNameMappings();
    this.dbGroups = await this.getGroups();
    this.dbMarkets = await this.getMarkets();
  }

  private async getGroups(): Promise<Group[]> {
    return await db("groups");
  }

  private async getMarkets(): Promise<Market[]> {
    return await db("markets");
  }

  async scrape(sourceName: string): Promise<void> {
    await this.init(sourceName); // initialize DB and mappings
    const { browser, page } = await this.launchBrowserWithProxy(true);
    await this.setupPage(page);
    // Process only active countries from DB
    let countryElements = await this.getCountryElements(page);
    // Step 1: Collapse Europe if it's expanded by default
    for (let i = 0; i < countryElements.length; i++) {
      const countryName = await this.getCountryName(page, countryElements[i]);
      if (countryName === "Football" && i + 1 < countryElements.length) {
        const nextCountry = countryElements[i + 1];
        const nextCountryName = await this.getCountryName(page, nextCountry);
        console.log(`🔽 Collapsing country after "Football": ${nextCountryName}`);
        await nextCountry.click(); // Collapse the one after "Football"
        await this.wait(3000);
        countryElements = await this.getCountryElements(page); // Refresh after collapsing
        break;
      }
    }

    let allMatches: Match[] = [];

    for (const country of countryElements) {
      const countryName = await this.getCountryName(page, country);
      if (!countryName || countryName === "Football") continue;

      // if (countryName !== "Cyprus") {
      //   continue;
      // }

      try {
        await country.click();
        await this.wait(3000);
      } catch (err) {
        console.warn(`⚠️ Failed to click country '${countryName}':`, err);
        continue;
      }

      const mappedCountryName = this.countryNameMappings[countryName.trim()] ?? countryName.trim();

      // Check if the country is active in our DB
      const dbCountry = await db("countries")
        .where("name", mappedCountryName)
        .andWhere("is_active", true)
        .first();
      if (!dbCountry) {
        console.warn(`Skipping inactive or unknown country: ${countryName}`);
        continue;
      }

      console.log(`🌍 Processing active country: ${countryName}`);
      // await country.click();
      // await this.wait(3000);

      const countryContainer = await this.getCountryContainer(page, country);
      if (!countryContainer) continue;

      // Get leagues from the page for this country
      const leagues = await this.getLeagues(page, countryContainer);
      // Build an array of active leagues with their DB record
      const activeLeagues: { leagueName: string; dbLeague: any }[] = [];
      for (const leagueName of leagues) {
        // Apply league name mapping if available
        // const mappedLeagueName = leagueNameMappings[leagueName] || leagueName;

        // Get all league mappings for this specific country
        const countryLeagueMappings = this.leagueNameMappings[dbCountry.code] || [];

        // Find the mapped league name if available
        const mapping = countryLeagueMappings.find(m => m.mapped_name === leagueName);
        const mappedLeagueName = mapping ? mapping.name : leagueName;

        const dbLeague = await db("leagues")
          .where("name", mappedLeagueName)
          .andWhere("country_code", dbCountry.code)
          .andWhere("is_active", true)
          .first();
        if (dbLeague) {
          activeLeagues.push({ leagueName, dbLeague });
        } else {
          console.warn(
            `Inactive or unmatched league: ${leagueName} in ${countryName}`
          );
        }
      }

      // Process each active league for the country
      for (const activeLeague of activeLeagues) {
        allMatches.push(
          ...(await this.processLeagues(
            page,
            countryContainer,
            countryName,
            activeLeague.leagueName,
            activeLeague.dbLeague.external_id // pass league external id
          ))
        );
      }
    }

    console.log("✅ Done scraping!");
    await browser.close();
  }

  private async setupPage(page: Page): Promise<void> {
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.resourceType() === 'websocket') return req.abort();
      req.continue();
    });

    // Forward console messages from browser to Node.js
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (["log", "debug", "warning", "error"].includes(type)) {
        console.log(`🟡 [PAGE.${type.toUpperCase()}] ${text}`);
      }
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // const url = "https://www.betmomo.com/en/sports/pre-match/event-view/Soccer";
    await page.goto(this.apiUrlTemplate, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector(".sp-sub-list-bc.Soccer.active.selected", {
      timeout: 30000,
    });
    console.log("✅ Soccer section loaded!");

    await page.evaluate(() => {
      document.querySelector(".popup-holder-bc.windowed.info")?.remove();
    });
  }

  private async getCountryElements(
    page: Page
  ): Promise<ElementHandle<Element>[]> {
    return page.$$(".sp-sub-list-bc.Soccer.active.selected .sp-s-l-head-bc");
  }

  private async getCountryName(
    page: Page,
    country: ElementHandle<Element>
  ): Promise<string | null> {
    return page.evaluate(
      (el) => el.getAttribute("title") || el.textContent?.trim() || "",
      country
    );
  }

  private async getCountryContainer(
    page: Page,
    country: ElementHandle<Element>
  ): Promise<JSHandle<Element> | null> {
    const handle = await page.evaluateHandle(
      (el) => el.nextElementSibling,
      country
    );
    return handle.asElement() ? (handle as JSHandle<Element>) : null;
  }

  private async getLeagues(
    page: Page,
    container: JSHandle<Element>
  ): Promise<string[]> {
    return page.evaluate((container) => {
      if (!container) return [];
      return Array.from(
        container.querySelectorAll(".sp-sub-list-bc .sp-s-l-head-bc")
      )
        .map(
          (league) =>
            league.getAttribute("title") || league.textContent?.trim() || ""
        )
        .filter(Boolean);
    }, container);
  }

  /**
   * Process a single league given its name and external id.
   */
  private async processLeagues(
    page: Page,
    countryContainer: JSHandle<Element>,
    countryName: string,
    leagueName: string,
    leagueExternalId: number
  ): Promise<Match[]> {
    let matches: Match[] = [];
    console.log(`⚽ Processing active league: ${leagueName}`);

    const leagueElement = (await countryContainer
      .asElement()
      ?.$(
        `.sp-s-l-head-bc[title="${leagueName}"]`
      )) as ElementHandle<Element> | null;
    if (!leagueElement) return matches;

    await leagueElement.click();
    await this.wait(3000);

    const matchHandles = await page.$$(".multi-column-content li");
    console.log(`📌 Found ${matchHandles.length} matches in ${leagueName}`);

    // Filter valid matches (with at least two teams)
    const validMatchHandles: ElementHandle<Element>[] = [];
    for (const matchHandle of matchHandles) {
      const isValid = await page.evaluate((el) => {
        const teams = el.querySelectorAll(".multi-column-single-team p");
        return teams && teams.length >= 2;
      }, matchHandle);
      if (isValid) validMatchHandles.push(matchHandle);
    }
    console.log(`📌 Valid matches: ${validMatchHandles.length}`);

    // Process matches while passing the leagueExternalId for fixture filtering
    matches.push(
      ...(await this.processMatches(
        page,
        validMatchHandles,
        countryName,
        leagueName,
        leagueExternalId
      ))
    );
    return matches;
  }

  private async extractOddsWithRetry(
    page: Page,
    matchHandle: ElementHandle<Element>,
    basicInfo: MatchInfo,
    retries = 3
  ): Promise<OddsData> {
    let lastErr: any;
    for (let i = 1; i <= retries; i++) {
      try {
        // open match detail
        await matchHandle.click();
        await this.wait(2000);

        // wait for panel
        await page.waitForSelector('.sgm-body-bc', { timeout: 8000 });
        await this.wait(1000);

        // scroll panel into view
        const panel = await page.$('.sgm-body-bc');
        await panel?.hover();
        await page.mouse.wheel({ deltaY: 500 });
        await this.wait(300);

        // extract odds
        const oddsData = await this.extractOdds(page);
        return oddsData;
      } catch (err: any) {
        lastErr = err;
        console.warn(`⚠️ Attempt ${i}/${retries} for ${basicInfo.teams.join(' vs ')} failed:`, err.message);
        // go back to list, then retry
        await page.goBack({ waitUntil: 'networkidle2' });
        await this.wait(1500);
      }
    }
    throw lastErr;
  }

  /**
   * Process matches for a given league.
   * @param leagueExternalId - the external id from the DB league record for fixture filtering.
   */
  private async processMatches(
    page: Page,
    matchHandles: ElementHandle<Element>[],
    country: string,
    league: string,
    leagueExternalId: number
  ): Promise<Match[]> {
    let matches: Match[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const matchHandle of matchHandles) {
      // const basicInfo = await this.getMatchInfo(page, matchHandle);
      // if (!basicInfo.teams.length) continue;

      // console.log(`🔎 Processing match:`, basicInfo);
      // await matchHandle.click();
      // await page
      //   .waitForSelector(".sgm-body-bc", { timeout: 10000 })
      //   .catch(() =>
      //     console.log(
      //       "⚠️ Detailed odds panel not found for match:",
      //       basicInfo.teams
      //     )
      //   );
      // await this.wait(2000);

      // const panel = await page.$('.sgm-body-bc');
      // if (!panel) throw new Error('Odds panel not found');

      // await panel.hover();
      // for (let i = 0; i < 15; i++) {
      //   // scroll down by a chunk
      //   await page.mouse.wheel({ deltaY: 500 });
      //   await this.wait(200);
      // }

      // Extract odds and add common external source fixture id
      // const oddsData = await this.extractOdds(page);


      //new
      const basicInfo = await this.getMatchInfo(page, matchHandle);
      if (!basicInfo.teams.length) continue;

      console.log(`🔎 Processing match:`, basicInfo);
      let oddsData: OddsData;
      try {
        oddsData = await this.extractOddsWithRetry(page, matchHandle, basicInfo, 3);
      } catch (err) {
        console.error(`❌ Odds extraction failed for ${basicInfo.teams.join(' vs ')}:`, err);
        continue;
      }
      oddsData.external_source_fixture_id = 1;

      // ----- Fixture matching logic -----
      const homeTeamRaw = basicInfo.teams[0];
      const awayTeamRaw = basicInfo.teams[1];

      const leagueTeamMappings = this.teamNameMappings[leagueExternalId] || [];

      // Apply team name mappings only from this league
      const homeTeam = leagueTeamMappings.find(m => m.mapped_name === homeTeamRaw)?.name ?? homeTeamRaw;
      const awayTeam = leagueTeamMappings.find(m => m.mapped_name === awayTeamRaw)?.name ?? awayTeamRaw;

      // Parse the date (format: dd.mm.yyyy) and time (e.g. "23:00")
      const dateParts = basicInfo.date.split(".");
      if (dateParts.length !== 3) {
        console.warn(`⚠️ Invalid date format for match: ${basicInfo.date}`);
        await page.goBack({ waitUntil: "networkidle2" });
        await this.wait(1500);
        continue;
      }

      const [day, month, year] = dateParts;
      // Build an ISO-like string: yyyy-mm-ddThh:mm:00
      const eventDateStr = `${year}-${month}-${day}T${basicInfo.time}:00`;

      const eventDate = new Date(eventDateStr);
      if (isNaN(eventDate.getTime())) {
        console.warn(
          `⚠️ Unable to parse event date/time for match: ${homeTeam} vs ${awayTeam} using "${eventDateStr}"`
        );
        await page.goBack({ waitUntil: "networkidle2" });
        await this.wait(1500);
        continue;
      }
      if (eventDate < today) {
        console.log(`🗓️ Skipping past fixture: ${homeTeam} vs ${awayTeam}`);
        await page.goBack({ waitUntil: "networkidle2" });
        await this.wait(1500);
        continue;
      }

      let fixture;
      try {
        fixture = await db("fixtures")
          .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
          .select("fixtures.*", "leagues.id as parent_league_id")
          .whereRaw(
            `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
            [`%${homeTeam}%`, `%${awayTeam}%`]
          )
          .andWhere("date", ">=", today)
          .andWhere("fixtures.league_id", leagueExternalId)
          .first();
      } catch (error) {
        console.error("Error fetching fixture:", error);
      }

      if (!fixture) {
        console.warn(
          `⚠️ No match found for fixture: ${homeTeam} vs ${awayTeam}`
        );
        await page.goBack({ waitUntil: "networkidle2" });
        await this.wait(1500);
        continue;
      }
      // ----- End Fixture matching logic -----

      // Process and save odds mapping for each market/outcome
      await this.processOddsMapping(fixture.id, oddsData);

      matches.push({ country, league, basicInfo, odds: oddsData });

      await page.goBack({ waitUntil: "networkidle2" });
      await this.wait(1500);
    }
    return matches;
  }

  private async getMatchInfo(
    page: Page,
    matchHandle: ElementHandle<Element>
  ): Promise<MatchInfo> {
    return page.evaluate((el) => {
      const teams = Array.from(
        el.querySelectorAll(".multi-column-single-team p")
      )
        .map((t) => t.textContent?.trim() ?? "")
        .filter(Boolean);
      const time =
        el.querySelector(".multi-column-time-icon time")?.textContent?.trim() ??
        "";
      // Look for the date from the closest ancestor that contains a date element
      const parent = el.closest(".competition-bc");
      let date = "";
      if (parent) {
        const dateEl = parent.querySelector("time.c-title-bc.ellipsis");
        if (dateEl) {
          date = dateEl.textContent?.trim() ?? "";
        }
      }
      return { teams, time, date };
    }, matchHandle);
  }

  private async extractOdds(page: Page): Promise<OddsData> {
    // 1) get the panel handle
    const panel = await page.$('.sgm-body-bc');
    if (!panel) throw new Error('Odds panel not found');

    // 2) define the market titles we care about
    const required = ["Match Result", "Both Teams To Score", "Total Goals"];

    // 3) scroll + retry until all three appear (or stop after 20 tries)
    for (let i = 0; i < 20; i++) {
      const titles = await page.$$eval(
        '.sgm-market-g-h-title-bc',
        els => els.map(el => el.getAttribute('title')?.trim() || "")
      );
      if (required.every(m => titles.includes(m))) {
        break;
      }
      await panel.hover();
      await page.mouse.wheel({ deltaY: 500 });
      await this.wait(300);
    }

    // 4) now extract exactly the three markets
    return page.evaluate(() => {
      const getMarket = (title: string) =>
        Array.from(document.querySelectorAll('.sgm-market-g')).find(m =>
          m.querySelector('.sgm-market-g-h-title-bc')
            ?.getAttribute('title')?.trim() === title
        ) as HTMLElement | undefined;

      const oddsFrom = (el?: HTMLElement, filterName?: string) => {
        if (!el) return [];
        let cells = Array.from(el.querySelectorAll('.sgm-market-g-i-cell-bc.market-bc'));
        if (filterName) {
          cells = cells.filter(c =>
            c.querySelector('.market-name-bc')?.textContent?.trim() === filterName
          );
        }
        return cells.map(c => c.querySelector('.market-odd-bc')?.textContent?.trim() || '0');
      };

      // 1X2
      const mr = getMarket("Match Result");
      const [home, draw, away] = oddsFrom(mr);

      // BTTS
      const btts = getMarket("Both Teams To Score");
      const [yes, no] = oddsFrom(btts);

      // Over/Under @2.5
      const tg = getMarket("Total Goals");
      const [over, under] = oddsFrom(tg, "2.5");

      return {
        matchResult: { home: home || "0", draw: draw || "0", away: away || "0" },
        bothTeams: { yes: yes || "0", no: no || "0" },
        totalGoals: { over: over || "0", under: under || "0" },
      } as OddsData;
    });
  }


  private async extractOddsNew(page: Page): Promise<OddsData> {
    // 1) get the panel
    const panel = await page.$('.sgm-body-bc');
    if (!panel) throw new Error('Odds panel not found');

    // 2) define the market titles we care about
    const required = ["Match Result", "Both Teams To Score", "Total Goals"];

    // 3) scroll until we've loaded all three, or until we've tried 20 times
    for (let i = 0; i < 20; i++) {
      const titles = await page.$$eval(
        '.sgm-market-g-h-title-bc',
        els => els.map(el => el.getAttribute('title')?.trim() || "")
      );
      // if all required markets are present, stop scrolling
      if (required.every(m => titles.includes(m))) break;

      // otherwise scroll a bit more
      await panel.hover();
      await page.mouse.wheel({ deltaY: 500 });
      await this.wait(300);
    }

    // 4) once scrolled, pull out exactly what you need
    return page.evaluate(() => {
      const getMarket = (title: string) => {
        return Array.from(document.querySelectorAll('.sgm-market-g')).find(m => {
          return m.querySelector('.sgm-market-g-h-title-bc')?.getAttribute('title')?.trim() === title;
        }) as HTMLElement | undefined;
      };

      const oddsFrom = (marketEl: HTMLElement | undefined, filterName?: string) => {
        if (!marketEl) return [];
        let cells = Array.from(marketEl.querySelectorAll('.sgm-market-g-i-cell-bc.market-bc'));
        if (filterName) {
          cells = cells.filter(c =>
            c.querySelector('.market-name-bc')?.textContent?.trim() === filterName
          );
        }
        return cells.map(c => c.querySelector('.market-odd-bc')?.textContent?.trim() ?? '0');
      };

      // Match Result
      const mr = getMarket("Match Result");
      const [home, draw, away] = oddsFrom(mr);

      // Both Teams To Score
      const btts = getMarket("Both Teams To Score");
      const [yes, no] = oddsFrom(btts);

      // Total Goals @ 2.5
      const tg = getMarket("Total Goals");
      const [over, under] = oddsFrom(tg, "2.5");

      return {
        matchResult: { home: home || "0", draw: draw || "0", away: away || "0" },
        bothTeams: { yes: yes || "0", no: no || "0" },
        totalGoals: { over: over || "0", under: under || "0" }
      } as OddsData;
    });
  }



  private async extractOddss(page: Page): Promise<OddsData> {
    return page.evaluate(() => {
      const log = (...args: any[]) => console.log("[extractOdds]", ...args);

      const getMarketTitleList = (): string[] => {
        return Array.from(document.querySelectorAll(".sgm-market-g-h-title-bc"))
          .map(el => el.getAttribute("title")?.trim() || "")
          .filter(Boolean);
      };

      const extractMarket = (title: string): Element | null => {
        const markets = Array.from(document.querySelectorAll(".sgm-market-g"));
        for (const market of markets) {
          const marketTitle = market.querySelector(".sgm-market-g-h-title-bc")?.getAttribute("title")?.trim();
          log("Checking market title:", marketTitle);
          if (marketTitle === title) return market;
        }
        log(`❌ Market '${title}' not found`);
        return null;
      };

      const extractOdds = (marketTitle: string): string[] => {
        const marketEl = extractMarket(marketTitle);
        if (!marketEl) return [];

        const cells = marketEl.querySelectorAll(".sgm-market-g-i-cell-bc.market-bc");
        const odds = Array.from(cells).map(cell => {
          const odd = cell.querySelector(".market-odd-bc")?.textContent?.trim() ?? "0";
          log(`✅ Found odd for '${marketTitle}':`, odd);
          return odd;
        });

        return odds;
      };

      const extractMatchResultOdds = (): OddsData["matchResult"] => {
        const odds = extractOdds("Match Result");
        return {
          home: odds[0] || "0",
          draw: odds[1] || "0",
          away: odds[2] || "0"
        };
      };

      const extractBothTeamsOdds = (): OddsData["bothTeams"] => {
        const odds = extractOdds("Both Teams To Score");
        return {
          yes: odds[0] || "0",
          no: odds[1] || "0"
        };
      };

      const extractTotalGoalsOdds = (): OddsData["totalGoals"] => {
        const market = extractMarket("Total Goals");
        if (!market) return { over: "0", under: "0" };

        const cells = Array.from(
          market.querySelectorAll(".sgm-market-g-i-cell-bc.market-bc")
        ).filter(cell =>
          cell.querySelector(".market-name-bc")?.textContent?.trim() === "2.5"
        );

        if (cells.length < 2) return { over: "0", under: "0" };

        return {
          over: cells[0]?.querySelector(".market-odd-bc")?.textContent?.trim() ?? "0",
          under: cells[1]?.querySelector(".market-odd-bc")?.textContent?.trim() ?? "0"
        };
      };

      // Print all available market titles to aid debugging
      log("🧠 Available market titles:", getMarketTitleList());

      return {
        matchResult: extractMatchResultOdds(),
        bothTeams: extractBothTeamsOdds(),
        totalGoals: extractTotalGoalsOdds(),
        rawHtml: document.querySelector(".sgm-body-bc")?.innerHTML || "❌ No odds container"
      };
    });
  }

  /**
   * Process the raw odds data using the extraction keys.
   * Match Result: map home/draw/away to "1", "x", "2".
   * Both Teams To Score: map to "yes" and "no".
   * Total Goals: map to "total_over__2_5" and "total_under_2_5".
   */
  private async processOddsMapping(
    fixtureId: number,
    odds: OddsData
  ): Promise<void> {
    // Process Match Result (1X2) market
    if (odds.matchResult) {
      const internalGroupName = this.groupMapping["1x2"]; // maps to "1X2"
      const dbGroup = this.dbGroups.find(
        (m) => m.group_name === internalGroupName
      );
      if (!dbGroup) {
        console.warn(`❌ No group found for ${internalGroupName}`);
      } else {
        const outcomes = [
          { alias: "1", coefficient: Number(odds.matchResult.home) },
          { alias: "x", coefficient: Number(odds.matchResult.draw) },
          { alias: "2", coefficient: Number(odds.matchResult.away) },
        ];
        for (const outcome of outcomes) {
          const outcomeName = this.outcomeNameNewMapping[outcome.alias];
          const dbMarket = this.dbMarkets.find(
            (mt) =>
              mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
              mt.group_id === dbGroup.group_id
          );
          if (!dbMarket) {
            console.warn(`❌ No market found for outcome: ${outcome.alias}`);
            continue;
          }
          await this.saveMarketOutcome(
            dbGroup.group_id,
            outcome.coefficient,
            dbMarket.market_id,
            fixtureId,
            String(odds.external_source_fixture_id)
          );
        }
      }
    }

    // Process Both Teams To Score market
    if (odds.bothTeams) {
      const internalGroupName = this.groupMapping["Both Teams To Score"];
      const dbGroup = this.dbGroups.find(
        (m) => m.group_name === internalGroupName
      );
      if (!dbGroup) {
        console.warn(`❌ No group found for ${internalGroupName}`);
      } else {
        const outcomes = [
          { alias: "yes", coefficient: Number(odds.bothTeams.yes) },
          { alias: "no", coefficient: Number(odds.bothTeams.no) },
        ];
        for (const outcome of outcomes) {
          const outcomeName = this.outcomeNameNewMapping[outcome.alias];
          const dbMarket = this.dbMarkets.find(
            (mt) =>
              mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
              mt.group_id === dbGroup.group_id
          );
          if (!dbMarket) {
            console.warn(`❌ No market found for outcome: ${outcome.alias}`);
            continue;
          }
          await this.saveMarketOutcome(
            dbGroup.group_id,
            outcome.coefficient,
            dbMarket.market_id,
            fixtureId,
            String(odds.external_source_fixture_id)
          );
        }
      }
    }

    // Process Total Goals market
    if (odds.totalGoals) {
      const internalGroupName = this.groupMapping["Total"];
      const dbGroup = this.dbGroups.find(
        (m) => m.group_name === internalGroupName
      );
      if (!dbGroup) {
        console.warn(`❌ No group found for ${internalGroupName}`);
      } else {
        const outcomes = [
          {
            alias: "total_over__2_5",
            coefficient: Number(odds.totalGoals.over),
          },
          {
            alias: "total_under_2_5",
            coefficient: Number(odds.totalGoals.under),
          },
        ];
        for (const outcome of outcomes) {
          const outcomeName = this.outcomeNameNewMapping[outcome.alias];
          const dbMarket = this.dbMarkets.find(
            (mt) =>
              mt.market_name.toLowerCase() === outcomeName.toLowerCase() &&
              mt.group_id === dbGroup.group_id
          );
          if (!dbMarket) {
            console.warn(`❌ No market found for outcome: ${outcome.alias}`);
            continue;
          }

          await OddsSnapshotService.saveOrUpdate({
            group_id: dbGroup.group_id,
            market_id: dbMarket.market_id,
            fixture_id: fixtureId,
            source_id: this.sourceId,
            external_source_fixture_id: odds.external_source_fixture_id?.toString() || "",
            coefficient: outcome.coefficient,
          });
          // await this.saveMarketOutcome(
          //   dbGroup.group_id,
          //   outcome.coefficient,
          //   dbMarket.market_id,
          //   fixtureId,
          //   String(odds.external_source_fixture_id)
          // );
        }
      }
    }
  }

  private async saveMarketOutcome(
    groupId: number,
    coefficient: number,
    marketId: number,
    fixtureId: number,
    externalSourceFixtureId: string
  ) {
    try {
      await db("fixture_odds")
        .insert({
          group_id: groupId,
          market_id: marketId,
          coefficient,
          fixture_id: fixtureId,
          external_source_fixture_id: externalSourceFixtureId,
          source_id: this.sourceId,
        })
        .onConflict([
          "group_id",
          "market_id",
          "fixture_id",
          "external_source_fixture_id",
          "source_id",
        ])
        .merge({
          coefficient: db.raw("EXCLUDED.coefficient"),
          updated_at: db.fn.now(),
        });
      console.log("Odds outcome inserted/updated successfully.");
    } catch (err) {
      console.error("Error saving odds outcome:", err);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
      .where("c.is_active", true) // Ensure country is active
      .select("lm.name", "lm.mapped_name", "l.country_code");

    // Group league mappings by country and store as an array
    this.leagueNameMappings = mappings.reduce((acc, mapping) => {
      if (!acc[mapping.country_code]) {
        acc[mapping.country_code] = []; // Initialize an empty array for each country
      }
      acc[mapping.country_code].push({
        name: mapping.name,
        mapped_name: mapping.mapped_name
      });
      return acc;
    }, {} as Record<string, { name: string; mapped_name: string }[]>);

    console.log("✅ Filtered league name mappings categorized by country loaded.");
  }

  private async loadTeamNameMappings() {
    console.log("🔄 Loading filtered team name mappings by league...");

    const mappings = await db("team_name_mappings as tm")
      .join("leagues as l", "tm.league_id", "=", "l.external_id")
      .where("l.is_active", true) // Ensure the league is active
      .select("tm.name", "tm.mapped_name", "l.external_id as league_id");

    // Group team mappings by league
    this.teamNameMappings = mappings.reduce((acc, mapping) => {
      if (!acc[mapping.league_id]) {
        acc[mapping.league_id] = []; // Initialize an array for each league
      }
      acc[mapping.league_id].push({
        name: mapping.name,
        mapped_name: mapping.mapped_name
      });
      return acc;
    }, {} as Record<number, { name: string; mapped_name: string }[]>);

    console.log("✅ Filtered team name mappings categorized by league loaded.");
  }
}

// ↓ now export the class itself
export default BetMomoScraperService;
