import { parse } from 'node-html-parser';
import { db } from '../../../infrastructure/database/Database';
import { fetchFromApiWithoutProxy } from '../../../utils/HttpClientAO';
import Group from "../../../models/Group";
import Market from "../../../models/Market";

interface OddsOutput {
    homeWin?: string;
    draw?: string;
    awayWin?: string;
    bttsYes?: string;
    bttsNo?: string;
    overUnder: Record<string, { under: string; over: string }>;
}

export class Fetch888BetsOddsService {
    private readonly oddsApiUrlTemplate = 'https://888bets.co.ao/Event/EventTab?sportId=1&EventId={eventId}&marketType=All';
    private readonly sourceName = 'AO_888BET';
    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    async init() {
        const source = await db('sources').where('name', this.sourceName).first();
        this.sourceId = source
            ? source.id
            : (await db('sources').insert({ name: this.sourceName }).returning('id'))[0];
        this.dbGroups = await db('groups');
        this.dbMarkets = await db('markets');
    }

    async syncOdds() {
        await this.init();

        const sourceMatches = await db('source_matches')
            .join('fixtures', 'source_matches.fixture_id', '=', 'fixtures.id')
            .join('leagues', 'fixtures.league_id', '=', 'leagues.external_id')
            .select(
                'source_matches.source_fixture_id',
                'source_matches.source_event_name',
                'fixtures.id as fixture_id',
                'fixtures.date'
            )
            .whereRaw('fixtures.date >= NOW()')
            .andWhere('leagues.is_active', true)
            .andWhere('source_matches.source_id', this.sourceId);

        for (const match of sourceMatches) {
            console.log(`🚀 Fetching odds for match: ${match.source_event_name} (${match.source_fixture_id})`);
            await this.fetchAndSaveOdds(match.source_fixture_id, match.source_event_name, match.fixture_id);
        }

        console.log('✅ 888Bets odds synced successfully!');
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, eventTitle: string, fixtureId: number) {
        const apiUrl = this.oddsApiUrlTemplate.replace('{eventId}', sourceFixtureId);
        const response = await fetchFromApiWithoutProxy(apiUrl, {
            headers: {
                Cookie: 'UserCulture=en-US',
            },
        });

        if (!response || !response.individual_Eventpage) return;

        const odds = this.extractOdds(response.individual_Eventpage);

        const save = async (groupName: string, marketName: string, oddsValue: string) => {
            const group = this.dbGroups.find((g) => g.group_name === groupName);
            const market = this.dbMarkets.find(
                (m) => m.group_id === group?.group_id && m.market_name === marketName
            );
            if (!group || !market || !oddsValue) return;

            await db('fixture_odds')
                .insert({
                    group_id: group.group_id,
                    market_id: market.market_id,
                    coefficient: oddsValue,
                    fixture_id: fixtureId,
                    external_source_fixture_id: sourceFixtureId,
                    source_id: this.sourceId,
                })
                .onConflict(['group_id', 'market_id', 'fixture_id', 'external_source_fixture_id', 'source_id'])
                .merge({
                    coefficient: db.raw('EXCLUDED.coefficient'),
                    updated_at: db.fn.now(),
                });

            console.log(`✅ Odds saved: ${groupName} - ${marketName} @ ${oddsValue}`);
        };

        await save('1X2', '1', odds.homeWin ?? '0');
        await save('1X2', 'X', odds.draw ?? '0');
        await save('1X2', '2', odds.awayWin ?? '0');
        await save('Both Teams to Score', 'Yes', odds.bttsYes ?? '0');
        await save('Both Teams to Score', 'No', odds.bttsNo ?? '0');

        const ou25 = odds.overUnder['2.5'];
        if (ou25) {
            await save('Over / Under', 'Over', ou25.over ?? '0');
            await save('Over / Under', 'Under', ou25.under ?? '0');
        }
    }

    private extractOdds(html: string): OddsOutput {
        const root = parse(html);
        const result: OddsOutput = { overUnder: {} };

        // Helper function with exact market name matching
        const getButtonsForMarket = (exactMarketName: string) => {
            const allButtons = Array.from(root.querySelectorAll('.SB-btnOutComeOdds'));
            return allButtons.filter(btn => {
                const onclick = btn.getAttribute('onclick') || '';
                // Match exact market name with word boundaries
                const marketPattern = new RegExp(`marketName['"]:\\s*['"]\\b${exactMarketName}\\b`);
                return marketPattern.test(onclick);
            });
        };

        // 1. Process only exact Match_Result market
        const matchResultButtons = getButtonsForMarket('Match_Result');
        for (const btn of matchResultButtons) {
            const outcome = btn.querySelector('.SB-outcome')?.text.trim();
            const odds = btn.querySelector('.SB-odds')?.text.trim();

            if (outcome === '1') result.homeWin = odds;
            else if (outcome === 'X') result.draw = odds;
            else if (outcome === '2') result.awayWin = odds;
        }

        // 2. Process only exact Both_Teams_to_Score market
        const bttsButtons = getButtonsForMarket('Both_Teams_to_Score');
        for (const btn of bttsButtons) {
            const outcome = btn.querySelector('.SB-outcome')?.text.trim().toLowerCase();
            const odds = btn.querySelector('.SB-odds')?.text.trim();

            if (outcome === 'yes') result.bttsYes = odds;
            else if (outcome === 'no') result.bttsNo = odds;
        }

        // 3. Process Over/Under Goals market (specifically 2.5)
        const overUnderButtons = getButtonsForMarket('Over/Under_Goals');
        for (const btn of overUnderButtons) {
            const onclick = btn.getAttribute('onclick') || '';
            // For Over/Under, odds are in SB-oddsCenter instead of SB-odds
            const odds = btn.querySelector('.SB-oddsCenter')?.text.trim();

            const match = onclick.match(/outcomeName['"]:\s*['"](Over|Under)_(2\.5)['"]/i);
            if (match && odds) {
                const direction = match[1].toLowerCase() as 'over' | 'under';
                result.overUnder['2.5'] = result.overUnder['2.5'] || { over: '', under: '' };
                result.overUnder['2.5'][direction] = odds;
            }
        }

        return result;
    }
}