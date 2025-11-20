import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientSN";
import { parse } from 'node-html-parser';
import fs from 'fs';

class SaveSnMojabetLeaguesWithFixturesService {
    private readonly leaguesApiUrl = "https://mojabet.sn/lazy/filters/tournament?stage=Prematch";
    private readonly fixturesApiUrlTemplate = "https://mojabet.sn/partial/football/prematch?segmentedFilterId=all&market=winner&tournaments={tournamentId}";

    async syncLeaguesAndFixtures() {
        console.log("🚀 Fetching SN Mojabet leagues and fixtures...");

        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Cookie": "ISO2=SEN; ISO3=XOF; XRegion=SEN; currencyId=99; defaultLanguage=fr-SN; language=en-SN; theme-key=Light-blue"
            },
            data: JSON.stringify({
                sportId: "Football",
                segmentedFilterId: "all"
            })
        });

        const html = parse(response);
        const selectElement = html.querySelector('select[data-tournaments-dropdown]');

        if (!selectElement) {
            console.warn("⚠️ No leagues dropdown found");
            return;
        }

        const jsonData: any = { countries: {} };
        const options = selectElement.querySelectorAll('option');
        let foundAllLeaguesOption = false;

        for (const option of options) {
            const value = option.getAttribute('value');
            const text = option.text.trim();

            // Skip until we find the "all-leagues" option
            if (value === 'all-leagues') {
                foundAllLeaguesOption = true;
                continue;
            }

            // Only process options after "all-leagues" option (country options)
            if (foundAllLeaguesOption && value && text) {
                await this.processCountryOption(value, text, jsonData);
            }
        }

        // Sort countries alphabetically
        jsonData.countries = Object.fromEntries(
            Object.entries(jsonData.countries).sort(([a], [b]) => a.localeCompare(b))
        );

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/sn/sn_mojabet_countries_leagues_fixtures_${dateStr}.json`;

        // Create directory if it doesn't exist
        const dirPath = './files/sn';
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async processCountryOption(leagueIds: string, countryName: string, jsonData: any) {
        if (!jsonData.countries[countryName]) {
            jsonData.countries[countryName] = { leagues: {} };
        }

        const leagueIdArray = leagueIds.split(',');
        for (const leagueId of leagueIdArray) {
            if (!jsonData.countries[countryName].leagues[leagueId]) {
                jsonData.countries[countryName].leagues[leagueId] = {
                    // name: `${countryName} League`, // Placeholder name
                    fixtures: []
                };

                // Fetch fixtures for this league
                await this.fetchLeagueFixtures(leagueId, countryName, jsonData);
            }
        }
    }

    private async fetchLeagueFixtures(leagueId: string, countryName: string, jsonData: any) {
        const apiUrl = this.fixturesApiUrlTemplate.replace("{tournamentId}", leagueId);

        try {
            const response = await fetchFromApiWithoutProxy(apiUrl, {
                headers: {
                    "Cookie": "ISO2=SEN; ISO3=XOF; XRegion=SEN; currencyId=99; defaultLanguage=fr-SN; language=en-SN; theme-key=Light-blue"
                }
            });

            const fixturesHtml = parse(response);
            const leagueElement = fixturesHtml.querySelector('.sportList__tournament-title');
            const leagueName = leagueElement?.text.trim();

            // Update the league name in the JSON data
            if (leagueName && jsonData.countries[countryName].leagues[leagueId]) {
                jsonData.countries[countryName].leagues[leagueId].name = leagueName;
            }

            const eventCards = fixturesHtml.querySelectorAll('.event-card__wrapper');

            for (const eventCard of eventCards) {
                const homeTeamElement = eventCard.querySelector('.competitors__competitor:first-child');
                const awayTeamElement = eventCard.querySelector('.competitors__competitor:last-child');
                const eventId = eventCard.getAttribute('data-event-card-id');

                const homeTeam = homeTeamElement?.text.trim();
                const awayTeam = awayTeamElement?.text.trim();

                if (homeTeam && awayTeam) {
                    const fixtures = jsonData.countries[countryName].leagues[leagueId].fixtures;
                    if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                    if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
                }
            }
        } catch (error) {
            console.error(`Error fetching fixtures for league ${leagueId}:`, error);
        }
    }
}

export default new SaveSnMojabetLeaguesWithFixturesService();