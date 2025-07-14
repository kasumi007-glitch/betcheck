import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCG";
import { parse } from 'node-html-parser';
import fs from 'fs';

class SaveEliteBetLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://elitebet.cg/?view=sport&sport=Sport_Football&s=coupons";
    private readonly fixturesApiUrlTemplate = "https://elitebet.cg/?view=competition&sport=Sport_Football&group={groupId}&competition={leagueId}";
    private readonly sourceName = "CG_ELITEBET";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching EliteBet leagues and fixtures...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
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
        let jsonData: any = { countries: {} };

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
                    jsonData.countries[currentCountry] = { leagues: {} };
                }
                else if (classes.includes('AZ_competitions_wrapper') && currentCountry) {
                    // This is a competitions wrapper for the current country
                    const competitionElements = element.querySelectorAll('.AZ_competition');
                    for (const competition of competitionElements) {
                        await this.processLeague(competition, currentCountry, jsonData);
                    }
                }
            }
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/cg_elitebet_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processLeague(competition: any, countryName: string, jsonData: any) {
        const onclickAttr = competition.getAttribute('onclick');
        if (!onclickAttr) return;

        const competitionIdMatch = onclickAttr.match(/competition=(\d+)/);
        if (!competitionIdMatch) return;

        const leagueId = competitionIdMatch[1];
        const leagueName = competition.querySelector('td')?.text.trim();
        if (!leagueName) return;

        console.log(`⚽ Processing league: ${leagueName}`);
        jsonData.countries[countryName].leagues[leagueId] = { name: leagueName, fixtures: [] };

        // Get source country ID from wrapper ID
        const wrapper = competition.parentNode;
        const sourceCountryIdMatch = wrapper.id.match(/AZ_competitions_wrapper_(\d+)/);
        const groupId = sourceCountryIdMatch ? sourceCountryIdMatch[1] : null;

        if (!groupId) return;

        // Fetch fixtures for this league
        const fixturesUrl = this.fixturesApiUrlTemplate
            .replace("{groupId}", groupId)
            .replace("{leagueId}", leagueId);

        const fixturesResponse = await fetchFromApiWithoutProxy(fixturesUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
            }
        });

        const fixturesHtml = parse(fixturesResponse);
        const events = fixturesHtml.querySelectorAll('.EVENT');

        for (const event of events) {
            const infoDiv = event.querySelector('.info');
            const competitorsDiv = infoDiv?.querySelector('.competitors');

            if (competitorsDiv) {
                const [homeTeam, awayTeam] = competitorsDiv.text.split(' - ').map(t => t.trim());
                if (homeTeam && awayTeam) {
                    const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                    if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                    if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
                }
            }
        }
    }
}

export default new SaveEliteBetLeaguesWithFixturesService();