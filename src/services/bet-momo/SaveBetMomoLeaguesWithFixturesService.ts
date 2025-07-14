import { launchBrowserWithProxy, launchBrowserWithoutProxy } from "../../utils/launchBrowserUtilCI";
import { Page, ElementHandle, JSHandle } from "puppeteer";
import fs from "fs";

class SaveBetMomoLeaguesWithFixturesService {
    private readonly url = "https://www.betmomo.com/en/sports/pre-match/event-view/Soccer";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching Bet223 leagues and fixtures...");
        const { browser, page } = await launchBrowserWithProxy(true);
        await this.setupPage(page);

        let jsonData: any = { countries: {} };
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

        // Step 2: Process all countries excluding "Europe"
        for (const country of countryElements) {
            const countryName = await this.getCountryName(page, country);
            if (!countryName || countryName === "Football") continue;

            try {
                await country.click();
                await this.wait(3000);
            } catch (err) {
                console.warn(`⚠️ Failed to click country '${countryName}':`, err);
                continue;
            }

            const countryContainer = await this.getCountryContainer(page, country);
            if (!countryContainer) continue;

            jsonData.countries[countryName] = { leagues: {} };
            console.log(`🌍 Processing active country: ${countryName}`);

            const leagues = await this.getLeagues(page, countryContainer);

            for (const league of leagues) {
                await this.processLeagues(
                    page,
                    countryContainer,
                    countryName,
                    league,
                    jsonData
                );
            }
        }

        // Optional: sort countries alphabetically
        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        // 🗓️ Add today's date
        const today = new Date();
        const dateStr = today.toISOString().split("T")[0]; // Example: "2025-04-29"

        // 📝 Save into /src/files/ folder
        const filePath = `./files/betmomo_countries_leagues_fixtures_${dateStr}.json`;
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);

        await browser.close();
    }


    private async setupPage(page: Page): Promise<void> {
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );

        await page.goto(this.url, { waitUntil: "networkidle2" });
        await page.waitForSelector(".sp-sub-list-bc.Soccer.active.selected", {
            timeout: 30000,
        });
        console.log("✅ Soccer section loaded!");

        await page.evaluate(() => {
            document.querySelector(".popup-holder-bc.windowed.info")?.remove();
        });
    }

    private async getCountryElements(page: Page): Promise<ElementHandle<Element>[]> {
        return page.$$(".sp-sub-list-bc.Soccer.active.selected .sp-s-l-head-bc");
    }

    private async getCountryName(page: Page, country: ElementHandle<Element>): Promise<string | null> {
        return page.evaluate(el => el.getAttribute("title") ?? el.textContent?.trim() ?? "", country);
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
        leagueName: string,
        jsonData: any
    ) {
        console.log(`⚽ Processing active league: ${leagueName}`);

        // Fetch the container again for fresh DOM state
        const containerEl = countryContainer.asElement();
        if (!containerEl) return;

        // Use `evaluate` to find the matching league via text or title
        const leagueHandles = await containerEl.$$(`.sp-s-l-head-bc`);
        let targetHandle: ElementHandle<Element> | null = null;

        for (const league of leagueHandles) {
            const name = await page.evaluate(el => el.getAttribute("title") || el.textContent?.trim(), league);
            if (name === leagueName) {
                targetHandle = league;
                break;
            }
        }

        if (!targetHandle) {
            console.warn(`❌ League element for '${leagueName}' not found or detached.`);
            return;
        }

        try {
            await targetHandle.evaluate(el => el.scrollIntoView({ behavior: "instant", block: "center" }));
            await this.wait(500);
            await targetHandle.click();
            await this.wait(3000);
        } catch (err) {
            console.warn(`⚠️ Failed to click league '${leagueName}':`, err);
            return;
        }

        jsonData.countries[countryName].leagues[leagueName] = { fixtures: [] };

        const matchHandles = await page.$$(".multi-column-content li");
        console.log(`📌 Found ${matchHandles.length} matches in ${leagueName}`);

        const validMatchHandles: ElementHandle<Element>[] = [];
        for (const matchHandle of matchHandles) {
            const isValid = await page.evaluate((el) => {
                const teams = el.querySelectorAll(".multi-column-single-team p");
                return teams && teams.length >= 2;
            }, matchHandle);
            if (isValid) validMatchHandles.push(matchHandle);
        }

        console.log(`📌 Valid matches: ${validMatchHandles.length}`);

        await this.processMatches(
            page,
            validMatchHandles,
            jsonData,
            leagueName,
            countryName
        );
    }


    private async processLeague(page: Page, league: ElementHandle<Element>, jsonData: any, countryName: string) {
        const leagueName = await page.evaluate(el => el.getAttribute("title") || el.textContent?.trim() || "", league);
        if (!leagueName) return;
        console.log(`⚽ Processing league: ${leagueName}`);

        jsonData.countries[countryName].leagues[leagueName] = { fixtures: [] };
        await league.click();
        await this.wait(3000);

        const fixtures = await this.getFixtures(page);
        for (const fixture of fixtures) {
            await this.processFixture(page, fixture, jsonData, countryName, leagueName);
        }
    }

    private async getFixtures(page: Page): Promise<ElementHandle<Element>[]> {
        return page.$$(".multi-column-content li");
    }

    private async processFixture(page: Page, fixture: ElementHandle<Element>, jsonData: any, countryName: string, leagueName: string) {
        const matchInfo = await this.getMatchInfo(page, fixture);
        if (!matchInfo.teams.length) return;
        console.log(`🔎 Processing match: ${matchInfo.teams.join(" vs ")}`);

        jsonData.countries[countryName].leagues[leagueName].fixtures.push(matchInfo);
    }

    private async processMatches(
        page: Page,
        matchHandles: ElementHandle<Element>[],
        jsonData: any,
        leagueName: string,
        countryName: string
    ) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const matchHandle of matchHandles) {
            const basicInfo = await this.getMatchInfo(page, matchHandle);
            if (!basicInfo.teams.length) continue;

            console.log(`🔎 Processing match:`, basicInfo);

            const homeTeam = basicInfo.teams[0];
            const awayTeam = basicInfo.teams[1];

            if (homeTeam && awayTeam && jsonData.countries[countryName].leagues[leagueName]) {
                const fixtures = jsonData.countries[countryName].leagues[leagueName].fixtures;
                if (!fixtures.includes(homeTeam)) {
                    fixtures.push(homeTeam);
                }
                if (!fixtures.includes(awayTeam)) {
                    fixtures.push(awayTeam);
                }
            }
        }
    }

    private async getMatchInfo(page: Page, fixture: ElementHandle<Element>): Promise<{ teams: string[], time: string, date: string }> {
        return page.evaluate(el => {
            const teams = Array.from(el.querySelectorAll(".multi-column-single-team p"))
                .map(t => t.textContent?.trim() ?? "")
                .filter(Boolean);
            const time = el.querySelector(".multi-column-time-icon time")?.textContent?.trim() ?? "";
            return { teams, time, date: "TBD" };
        }, fixture);
    }

    private async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default new SaveBetMomoLeaguesWithFixturesService();
