import { launchBrowser } from "../../utils/launchBrowserUtil";
import { Page, ElementHandle, JSHandle } from "puppeteer";
import { db } from "../../infrastructure/database/Database";
import fs from "fs";

class SaveBetMomoLeaguesWithFixturesService {
    private readonly sourceName = "BetMomo";
    private readonly url = "https://www.betmomo.com/en/sports/pre-match/event-view/Soccer";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching BetMomo leagues and fixtures...");
        const { browser, page } = await launchBrowser();
        await this.setupPage(page);

        let jsonData: any = { countries: {} };
        const countryElements = await this.getCountryElements(page);

        const dbCountries = await db("countries")
            .andWhere("is_active", true);

        for (const country of countryElements) {
            const countryName = await this.getCountryName(page, country);
            if (!countryName) continue;

            // Check if the country is active in our DB
            // const dbCountry = await db("countries")
            //     .where("name", countryName)
            //     .andWhere("is_active", true)
            //     .first();
            const dbCountry = dbCountries.find((c) => c.name === countryName);
            if (!dbCountry) {
                console.warn(`Skipping inactive or unknown country: ${countryName}`);
                continue;
            }

            await country.click();
            await this.wait(3000);

            const countryContainer = await this.getCountryContainer(page, country);
            if (!countryContainer) continue;

            jsonData.countries[countryName] = { leagues: {} };

            console.log(`🌍 Processing active country: ${countryName}`);

            const leagues = await this.getLeagues(page, countryContainer);

            for (const league of leagues) {
                await this.processLeagues(page,
                    countryContainer,
                    countryName,
                    league,
                    jsonData);
            }
        }

        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        fs.writeFileSync("betmomo_leagues_fixtures.json", JSON.stringify(jsonData, null, 2));
        console.log("✅ JSON file generated: betmomo_leagues_fixtures.json");

        await browser.close();
    }

    private async setupPage(page: Page): Promise<void> {
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );

        const url = "https://www.betmomo.com/en/sports/pre-match/event-view/Soccer";
        await page.goto(url, { waitUntil: "networkidle2" });
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
        jsonData: any) {
        console.log(`⚽ Processing active league: ${leagueName}`);

        const leagueElement = (await countryContainer
            .asElement()
            ?.$(
                `.sp-s-l-head-bc[title="${leagueName}"]`
            )) as ElementHandle<Element> | null;
        if (!leagueElement) return;

        // jsonData.countries[countryName].leagues[1] = { name: leagueName, fixtures: [] };
        jsonData.countries[countryName].leagues[leagueName] = { fixtures: [] };
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
        await this.processMatches(
            page,
            validMatchHandles,
            jsonData,
            leagueName,
            countryName
        )
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
