import { parse } from 'node-html-parser';
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientAO";
import fs from 'fs';

class Save888BetsLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://888bets.co.ao/sportspage/allleaguestab?sportname=football";
    private readonly fixturesApiUrlTemplate = "https://888bets.co.ao/SportsPage/LeagueMatches?sportname=football&strCountry={country}&market=&leagueid={leagueId}";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching 888Bets leagues and fixtures...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            headers: {
                "Cookie": "UserCulture=en-US"
            }
        });

        // const data = JSON.parse(response);
        const html = parse(response.sportsAllLeagues);
        const countryAccordions = html.querySelectorAll('.SB-countryAccordion');
        let jsonData: any = { countries: {} };

        for (const countryAcc of countryAccordions) {
            const countryHeader = countryAcc.querySelector('.SB-countryAccordion-header');
            const countryName = countryHeader?.querySelector('.SB-sidePanelList-item-content a')?.text.trim();
            if (!countryName) continue;
            // if (countryName !== 'World') continue;

            jsonData.countries[countryName] = { leagues: {} };

            const leagueItems = countryAcc.querySelectorAll('.SB-sidePanelList-leagueItem');
            for (const leagueItem of leagueItems) {
                await this.processLeague(leagueItem, countryName, jsonData);
            }
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/ao_888bets_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processLeague(leagueItem: any, countryName: string, jsonData: any) {
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

        console.log(`⚽ Processing league: ${leagueName}`);
        jsonData.countries[countryName].leagues[sourceLeagueId] = { name: leagueName, fixtures: [] };

        // Fetch fixtures for this league
        const fixturesUrl = this.fixturesApiUrlTemplate
            .replace("{country}", encodeURIComponent(countryName))
            .replace("{leagueId}", sourceLeagueId);

        const fixturesResponse = await fetchFromApiWithoutProxy(fixturesUrl, {
            headers: {
                'Cookie': 'UserCulture=en-US'
            }
        });

        const fixturesHtml = parse(fixturesResponse.sportsLeagueData);
        const matchBoxes = fixturesHtml.querySelectorAll('.SB-matchBox');

        for (const matchBox of matchBoxes) {
            const homeTeam = matchBox.querySelector('.SB-match__teamName.home')?.text.trim();
            const awayTeam = matchBox.querySelector('.SB-match__teamName.away')?.text.trim();

            if (homeTeam && awayTeam) {
                const fixtures = jsonData.countries[countryName].leagues[sourceLeagueId].fixtures;
                if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
            }
        }
    }
}

export default new Save888BetsLeaguesWithFixturesService();