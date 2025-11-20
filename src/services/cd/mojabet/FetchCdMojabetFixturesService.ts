import { db } from "../../../infrastructure/database/Database";
import { fetchFromApiWithoutProxy } from "../../../utils/HttpClientCD";
import { parse } from 'node-html-parser';

class FetchCdMojabetFixturesService {
    private readonly leaguesApiUrl = "https://mojabet.cd/lazy/filters/tournament?stage=Prematch";
    private readonly fixturesApiUrlTemplate = "https://mojabet.cd/partial/football/prematch?segmentedFilterId=all&market=winner&tournaments={tournamentId}";
    private readonly sourceName = "CD_MOJABET";
    private sourceId!: number;
    private countryNameMappings: Record<string, string> = {};
    private teamNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: this.sourceName }).returning("id"))[0];
        await this.loadCountryNameMappings();
        await this.loadTeamNameMappings();
    }

    async syncFixtures() {
        await this.init();

        console.log("🚀 Fetching CD Mojabet leagues and fixtures...");

        // First fetch all country leagues
        const countryLeagues = await this.fetchAllCountryLeagues();

        console.log(`Found ${Object.keys(countryLeagues).length} countries to process`);

        // Process fixtures for each country and its leagues
        for (const [countryName, leagueIds] of Object.entries(countryLeagues)) {
            console.log(`🌍 Processing ${countryName} with ${leagueIds.length} leagues`);

            for (const leagueId of leagueIds) {
                await this.processLeagueFixtures(leagueId, countryName);
            }
        }

        console.log("✅ CD Mojabet fixtures synced successfully!");
    }

    private async fetchAllCountryLeagues(): Promise<Record<string, string[]>> {
        const response = await fetchFromApiWithoutProxy(this.leaguesApiUrl, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Cookie": "ISO2=CONGO; ISO3=CDF; XRegion=COD; currencyId=99; defaultLanguage=fr-SN; language=fr-SN; theme-key=Light-blue"
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
            return {};
        }

        const options = selectElement.querySelectorAll('option');
        let foundAllLeaguesOption = false;
        const countryLeagues: Record<string, string[]> = {};

        for (const option of options) {
            const value = option.getAttribute('value');
            const text = option.text.trim();

            // Skip until we find the "all-leagues" option
            if (value === 'all-leagues') {
                foundAllLeaguesOption = true;
                continue;
            }

            // Only process options after "all-leagues" option (these are country options)
            if (foundAllLeaguesOption && value && text && value.includes(',')) {
                const mappedCountryName = this.countryNameMappings[text] || text;

                // if (mappedCountryName !== 'England') continue;

                if (!countryLeagues[mappedCountryName]) {
                    countryLeagues[mappedCountryName] = [];
                }

                const leagueIds = value.split(',');
                countryLeagues[mappedCountryName].push(...leagueIds);
                console.log(`Found ${leagueIds.length} leagues for ${mappedCountryName}`);
            }
        }

        return countryLeagues;
    }

    private async processLeagueFixtures(leagueId: string, countryName: string) {
        const apiUrl = this.fixturesApiUrlTemplate.replace("{tournamentId}", leagueId);

        try {
            const response = await fetchFromApiWithoutProxy(apiUrl, {
                headers: {
                    "Cookie": "ISO2=CONGO; ISO3=CDF; XRegion=COD; currencyId=99; defaultLanguage=fr-SN; language=fr-SN; theme-key=Light-blue"
                }
            });

            const fixturesHtml = parse(response);
            const eventCards = fixturesHtml.querySelectorAll('.event-card__wrapper');

            console.log(`Found ${eventCards.length} fixtures for league ${leagueId} in ${countryName}`);

            for (const eventCard of eventCards) {
                await this.processFixture(eventCard, leagueId, countryName);
            }
        } catch (error) {
            console.error(`Error fetching fixtures for league ${leagueId} in ${countryName}:`, error);
        }
    }

    private async processFixture(eventCard: any, leagueId: string, countryName: string) {
        try {
            const homeTeamElement = eventCard.querySelector('.competitors__competitor:first-child');
            const awayTeamElement = eventCard.querySelector('.competitors__competitor:last-child');
            const eventId = eventCard.getAttribute('data-event-card-id');

            const homeTeam = homeTeamElement?.text.trim();
            const awayTeam = awayTeamElement?.text.trim();

            if (!homeTeam || !awayTeam || !eventId) {
                console.warn('⚠️ Missing team names or event ID');
                return;
            }

            console.log(`Processing: ${homeTeam} vs ${awayTeam} in ${countryName}`);

            // Try to find matching fixture for this country
            const dbFixture = await this.findMatchingFixture(homeTeam, awayTeam, countryName);

            if (!dbFixture) {
                console.warn(`⚠️ No matching fixture found for ${homeTeam} vs ${awayTeam} in ${countryName}`);
                return;
            }

            // Insert or update source match record
            const result = await db("source_matches").insert({
                source_fixture_id: eventId,
                source_competition_id: leagueId,
                source_event_name: `${homeTeam} v ${awayTeam}`,
                fixture_id: dbFixture.id,
                competition_id: dbFixture.parent_league_id,
                source_id: this.sourceId,
            }).onConflict(["fixture_id", "source_id", "source_fixture_id"])
                .ignore()
                .returning("*");

            if (result.length > 0) {
                console.log(`✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`);
            } else {
                console.warn(`⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`);
            }
        } catch (error) {
            console.error('Error processing fixture:', error);
        }
    }

    private async findMatchingFixture(homeTeam: string, awayTeam: string, countryName: string) {
        // Get country code from name
        const dbCountry = await db("countries")
            .where("name", countryName)
            .andWhere("is_active", true)
            .first();

        if (!dbCountry) {
            console.warn(`⚠️ Country not found in database: ${countryName}`);
            return null;
        }

        // Apply team name mapping for this country
        const mappings = this.teamNameMappings[dbCountry.code] || [];
        const mappedHomeTeam = mappings.find(m => m.mapped_name === homeTeam)?.name || homeTeam;
        const mappedAwayTeam = mappings.find(m => m.mapped_name === awayTeam)?.name || awayTeam;

        // Find matching fixture in this country's leagues
        return await db("fixtures")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .join("countries", "leagues.country_code", "=", "countries.code")
            .select("fixtures.*", "leagues.id as parent_league_id")
            .whereRaw("LOWER(fixtures.home_team_name) ILIKE ?", [`%${mappedHomeTeam.toLowerCase()}%`])
            .whereRaw("LOWER(fixtures.away_team_name) ILIKE ?", [`%${mappedAwayTeam.toLowerCase()}%`])
            .andWhere("countries.name", countryName)
            .andWhere("fixtures.date", ">=", "NOW()")
            .first();
    }

    private async loadCountryNameMappings() {
        const mappings = await db("country_name_mappings").select("name", "mapped_name");
        this.countryNameMappings = mappings.reduce((acc, mapping) => {
            acc[mapping.mapped_name] = mapping.name;
            return acc;
        }, {} as Record<string, string>);
    }

    private async loadTeamNameMappings() {
        const mappings = await db("team_name_mappings as tm")
            .join("leagues as l", "tm.league_id", "=", "l.external_id")
            .join("countries as c", "l.country_code", "=", "c.code")
            .where("l.is_active", true)
            .select("tm.name", "tm.mapped_name", "c.code as country_code");

        this.teamNameMappings = mappings.reduce((acc, mapping) => {
            if (!acc[mapping.country_code]) acc[mapping.country_code] = [];
            acc[mapping.country_code].push({
                name: mapping.name,
                mapped_name: mapping.mapped_name
            });
            return acc;
        }, {} as Record<string, { name: string; mapped_name: string }[]>);
    }
}

export default FetchCdMojabetFixturesService;