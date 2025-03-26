import { launchBrowser } from "../../utils/launchBrowserUtil";
import puppeteer, { Browser, Page, ElementHandle, JSHandle } from "puppeteer";

interface MatchInfo {
  teams: string[];
  time: string;
}

interface OddsData {
  matchResult?: { home: string; draw: string; away: string };
  bothTeams?: { yes: string; no: string };
  totalGoals?: { over: string; under: string };
}

interface Match {
  country: string;
  league: string;
  basicInfo: MatchInfo;
  odds: OddsData;
}

class Bet223ScraperOldService {
  async scrape(): Promise<void> {
    const { browser, page } = await launchBrowser();
    await this.setupPage(page);
    const countryElements = await this.getCountryElements(page);

    let allMatches: Match[] = [];

    for (const country of countryElements) {
      const countryName = await this.getCountryName(page, country);
      if (!countryName || countryName !== "England") continue;

      console.log(`🌍 Processing Country: ${countryName}`);
      await country.click();
      await this.wait(3000);

      const countryContainer = await this.getCountryContainer(page, country);
      if (!countryContainer) continue;

      const leagues = await this.getLeagues(page, countryContainer);
      allMatches.push(
        ...(await this.processLeagues(
          page,
          countryContainer,
          countryName,
          leagues
        ))
      );
    }

    console.log("✅ Done!");
    await browser.close();
  }

  private async setupPage(page: Page): Promise<void> {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    const url =
      "https://www.betmomo.com/en/sports/pre-match/event-view/Soccer";
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

  private async processLeagues(
    page: Page,
    countryContainer: JSHandle<Element>,
    countryName: string,
    leagues: string[]
  ): Promise<Match[]> {
    let matches: Match[] = [];

    for (const leagueName of leagues) {
      if (!leagueName) continue;

      console.log(`⚽ Processing League: ${leagueName}`);

      const leagueElement = (await countryContainer
        .asElement()
        ?.$(
          `.sp-s-l-head-bc[title="${leagueName}"]`
        )) as ElementHandle<Element> | null;
      if (!leagueElement) continue;

      await leagueElement.click();
      await this.wait(3000);

      const matchHandles = await page.$$(".multi-column-content li");

      console.log(`📌 Found ${matchHandles.length} matches in ${leagueName}`);

      // ✅ Filter valid matches (with at least two teams)
      const validMatchHandles = [];
      for (const matchHandle of matchHandles) {
        const isValid = await page.evaluate((el) => {
          const teams = el.querySelectorAll(".multi-column-single-team p");
          return teams && teams.length >= 2;
        }, matchHandle);
        if (isValid) validMatchHandles.push(matchHandle);
      }
      console.log(`📌 Valid matches: ${validMatchHandles.length}`);

      matches.push(
        ...(await this.processMatches(
          page,
          validMatchHandles,
          countryName,
          leagueName
        ))
      );
    }
    return matches;
  }

  private async processMatches(
    page: Page,
    matchHandles: ElementHandle<Element>[],
    country: string,
    league: string
  ): Promise<Match[]> {
    let matches: Match[] = [];

    for (const matchHandle of matchHandles) {
      const basicInfo = await this.getMatchInfo(page, matchHandle);
      if (!basicInfo.teams.length) continue;

      console.log(`🔎 Processing match:`, basicInfo);
      await matchHandle.click();
      await page
        .waitForSelector(".sgm-body-bc", { timeout: 10000 })
        .catch(() => console.log("⚠️ Detailed odds panel not found."));
      await this.wait(2000);

      const oddsData = await this.extractOdds(page);
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
        .map((t) => t.textContent?.trim() || "")
        .filter(Boolean);
      const time =
        el.querySelector(".multi-column-time-icon time")?.textContent?.trim() ||
        "";
      return { teams, time };
    }, matchHandle);
  }

  private async extractOdds(page: Page): Promise<OddsData> {
    return page.evaluate(() => {
      // Helper function: Find a market container by its title
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

      // Generic function to extract odds from a given market
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

      // Extract 1X2 odds from the "Match Result" market
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

        // Ensure at least two cells exist (for Over and Under)
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
        totalGoals: extractTotalGoalsOdds() || { over: "N/A", under: "N/A" }, // Ensure totalGoals always has a valid structure
      };
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new Bet223ScraperOldService();
