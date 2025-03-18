import { launchBrowser } from "../../utils/launchBrowserUtil";
import { Page, ElementHandle, JSHandle } from "puppeteer";
import { db } from "../../infrastructure/database/Database";
import { teamNameMappings } from "../teamNameMappings";
import { leagueNameMappings } from "../leagueNameMappings"; // import league name mappings

interface Market {
  id: number;
  group_id: number;
  name: string;
  order: number;
}

interface MarketType {
   id: number;
   market_id: number;
   name: string;
   order: number;
}

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

class Bet223ScraperService {
  // ----- Odds mapping configuration -----
  private readonly marketMapping: Record<string, string> = {
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

  private dbMarkets: Market[] = [];
  private dbMarketTypes: MarketType[] = [];
  private sourceName = "Bet223";
  private sourceId!: number;
  // ----- End Odds mapping configuration -----

  async init() {
    const source = await db("sources").where("name", this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db("sources")
        .insert({ name: this.sourceName })
        .returning("id");
    } else {
      this.sourceId = source.id;
    }
    this.dbMarkets = await this.getMarkets();
    this.dbMarketTypes = await this.getMarketTypes();
  }

  private async getMarkets(): Promise<Market[]> {
    return await db("markets");
  }

  private async getMarketTypes(): Promise<MarketType[]> {
    return await db("market_types");
  }

  async scrape(): Promise<void> {
    await this.init(); // initialize DB and mappings
    const { browser, page } = await launchBrowser();
    await this.setupPage(page);

    // Process only active countries from DB
    const countryElements = await this.getCountryElements(page);
    let allMatches: Match[] = [];

    for (const country of countryElements) {
      const countryName = await this.getCountryName(page, country);
      if (!countryName) continue;

      // Check if the country is active in our DB
      const dbCountry = await db("countries")
        .where("name", countryName)
        .andWhere("is_active", true)
        .first();
      if (!dbCountry) {
        console.warn(`Skipping inactive or unknown country: ${countryName}`);
        continue;
      }

      console.log(`🌍 Processing active country: ${countryName}`);
      await country.click();
      await this.wait(3000);

      const countryContainer = await this.getCountryContainer(page, country);
      if (!countryContainer) continue;

      // Get leagues from the page for this country
      const leagues = await this.getLeagues(page, countryContainer);
      // Build an array of active leagues with their DB record
      const activeLeagues: { leagueName: string; dbLeague: any }[] = [];
      for (const leagueName of leagues) {
        // Apply league name mapping if available
        const mappedLeagueName = leagueNameMappings[leagueName] || leagueName;
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
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    const url =
      "https://www.bet2africa.ml/en/sports/pre-match/event-view/Soccer";
    await page.goto(url, { waitUntil: "networkidle2" });
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
    leagueExternalId: string
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

  /**
   * Process matches for a given league.
   * @param leagueExternalId - the external id from the DB league record for fixture filtering.
   */
  private async processMatches(
    page: Page,
    matchHandles: ElementHandle<Element>[],
    country: string,
    league: string,
    leagueExternalId: string
  ): Promise<Match[]> {
    let matches: Match[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const matchHandle of matchHandles) {
      const basicInfo = await this.getMatchInfo(page, matchHandle);
      if (!basicInfo.teams.length) continue;

      console.log(`🔎 Processing match:`, basicInfo);
      await matchHandle.click();
      await page
        .waitForSelector(".sgm-body-bc", { timeout: 10000 })
        .catch(() =>
          console.log(
            "⚠️ Detailed odds panel not found for match:",
            basicInfo.teams
          )
        );
      await this.wait(2000);

      // Extract odds and add common external source fixture id
      const oddsData = await this.extractOdds(page);
      oddsData.external_source_fixture_id = 1;

      // ----- Fixture matching logic -----
      const homeTeamRaw = basicInfo.teams[0];
      const awayTeamRaw = basicInfo.teams[1];
      const homeTeam = teamNameMappings[homeTeamRaw] || homeTeamRaw;
      const awayTeam = teamNameMappings[awayTeamRaw] || awayTeamRaw;

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

      let fixture = await db("fixtures")
        .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
        .select("fixtures.*", "leagues.id as parent_league_id")
        .whereRaw(
          `LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)`,
          [`%${homeTeam}%`, `%${awayTeam}%`]
        )
        .andWhere("date", ">=", today)
        .andWhere("fixtures.league_id", leagueExternalId)
        .first();

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
    return page.evaluate(() => {
      // Helper: find market container by its title
      const extractMarket = (marketTitle: string): Element | null => {
        return (
          Array.from(document.querySelectorAll(".sgm-market-g")).find(
            (el) =>
              el
                .querySelector(".sgm-market-g-h-title-bc")
                ?.getAttribute("title")
                ?.trim() === marketTitle
          ) || null
        );
      };

      const extractOdds = (marketTitle: string): string[] => {
        const marketEl = extractMarket(marketTitle);
        if (!marketEl) return [];
        return Array.from(
          marketEl.querySelectorAll(".sgm-market-g-i-cell-bc.market-bc")
        ).map(
          (cell) =>
            cell.querySelector(".market-odd-bc")?.textContent?.trim() || "N/A"
        );
      };

      // Extract Match Result odds from the "Match Result" market
      const extractMatchResultOdds = (): {
        home: string;
        draw: string;
        away: string;
      } => {
        const odds = extractOdds("Match Result");
        return {
          home: odds[0] || "N/A",
          draw: odds[1] || "N/A",
          away: odds[2] || "N/A",
        };
      };

      // Extract Both Teams To Score odds from the "Both Teams To Score" market
      const extractBothTeamsOdds = (): { yes: string; no: string } => {
        const odds = extractOdds("Both Teams To Score");
        return {
          yes: odds[0] || "N/A",
          no: odds[1] || "N/A",
        };
      };

      // Extract Total Goals odds for the "2.5" market from the "Total Goals" market
      const extractTotalGoalsOdds = (): {
        over: string;
        under: string;
      } | null => {
        const marketEl = extractMarket("Total Goals");
        if (!marketEl) return null;
        // Filter cells that have a market name exactly "2.5"
        const cells = Array.from(
          marketEl.querySelectorAll(".sgm-market-g-i-cell-bc.market-bc")
        ).filter(
          (cell) =>
            cell.querySelector(".market-name-bc")?.textContent?.trim() === "2.5"
        );
        if (cells.length < 2) return null;
        return {
          over:
            cells[0]?.querySelector(".market-odd-bc")?.textContent?.trim() ||
            "N/A",
          under:
            cells[1]?.querySelector(".market-odd-bc")?.textContent?.trim() ||
            "N/A",
        };
      };

      return {
        matchResult: extractMatchResultOdds(),
        bothTeams: extractBothTeamsOdds(),
        totalGoals: extractTotalGoalsOdds() || { over: "N/A", under: "N/A" },
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
      const internalMarketName = this.marketMapping["1x2"]; // maps to "1X2"
      const dbMarket = this.dbMarkets.find(
        (m) => m.name === internalMarketName
      );
      if (!dbMarket) {
        console.warn(`❌ No market found for ${internalMarketName}`);
      } else {
        const outcomes = [
          { alias: "1", coefficient: Number(odds.matchResult.home) },
          { alias: "x", coefficient: Number(odds.matchResult.draw) },
          { alias: "2", coefficient: Number(odds.matchResult.away) },
        ];
        for (const outcome of outcomes) {
          const outcomeName = this.outcomeNameNewMapping[outcome.alias];
          const dbMarketType = this.dbMarketTypes.find(
            (mt) =>
              mt.name.toLowerCase() === outcomeName.toLowerCase() &&
              mt.market_id === dbMarket.id
          );
          if (!dbMarketType) {
            console.warn(
              `❌ No market type found for outcome: ${outcome.alias}`
            );
            continue;
          }
          await this.saveMarketOutcome(
            dbMarketType.id,
            outcome.coefficient,
            dbMarket.id,
            fixtureId,
            String(odds.external_source_fixture_id)
          );
        }
      }
    }

    // Process Both Teams To Score market
    if (odds.bothTeams) {
      const internalMarketName = this.marketMapping["Both Teams To Score"];
      const dbMarket = this.dbMarkets.find(
        (m) => m.name === internalMarketName
      );
      if (!dbMarket) {
        console.warn(`❌ No market found for ${internalMarketName}`);
      } else {
        const outcomes = [
          { alias: "yes", coefficient: Number(odds.bothTeams.yes) },
          { alias: "no", coefficient: Number(odds.bothTeams.no) },
        ];
        for (const outcome of outcomes) {
          const outcomeName = this.outcomeNameNewMapping[outcome.alias];
          const dbMarketType = this.dbMarketTypes.find(
            (mt) =>
              mt.name.toLowerCase() === outcomeName.toLowerCase() &&
              mt.market_id === dbMarket.id
          );
          if (!dbMarketType) {
            console.warn(
              `❌ No market type found for outcome: ${outcome.alias}`
            );
            continue;
          }
          await this.saveMarketOutcome(
            dbMarketType.id,
            outcome.coefficient,
            dbMarket.id,
            fixtureId,
            String(odds.external_source_fixture_id)
          );
        }
      }
    }

    // Process Total Goals market
    if (odds.totalGoals) {
      const internalMarketName = this.marketMapping["Total"];
      const dbMarket = this.dbMarkets.find(
        (m) => m.name === internalMarketName
      );
      if (!dbMarket) {
        console.warn(`❌ No market found for ${internalMarketName}`);
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
          const dbMarketType = this.dbMarketTypes.find(
            (mt) =>
              mt.name.toLowerCase() === outcomeName.toLowerCase() &&
              mt.market_id === dbMarket.id
          );
          if (!dbMarketType) {
            console.warn(
              `❌ No market type found for outcome: ${outcome.alias}`
            );
            continue;
          }
          await this.saveMarketOutcome(
            dbMarketType.id,
            outcome.coefficient,
            dbMarket.id,
            fixtureId,
            String(odds.external_source_fixture_id)
          );
        }
      }
    }
  }

  private async saveMarketOutcome(
    marketTypeId: number,
    coefficient: number,
    marketId: number,
    fixtureId: number,
    externalSourceFixtureId: string
  ) {
    try {
      await db("odds")
        .insert({
          market_id: marketId,
          market_type_id: marketTypeId,
          coefficient,
          fixture_id: fixtureId,
          external_source_fixture_id: externalSourceFixtureId,
          source_id: this.sourceId,
        })
        .onConflict([
          "market_id",
          "market_type_id",
          "fixture_id",
          "external_source_fixture_id",
          "source_id",
        ])
        .merge(["coefficient"]);
      console.log("Odds outcome inserted/updated successfully.");
    } catch (err) {
      console.error("Error saving odds outcome:", err);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new Bet223ScraperService();
