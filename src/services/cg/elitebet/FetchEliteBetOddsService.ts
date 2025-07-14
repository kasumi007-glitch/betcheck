import { parse } from 'node-html-parser';
import { db } from '../../../infrastructure/database/Database';
import { fetchFromApiWithoutProxy } from '../../../utils/HttpClientCG';
import Group from "../../../models/Group";
import Market from "../../../models/Market";

interface OddsOutput {
    homeWin?: string;
    draw?: string;
    awayWin?: string;
    bttsYes?: string;
    bttsNo?: string;
    overUnder: Record<string, { under?: string; over?: string }>;
}

export class FetchEliteBetOddsService {
    private readonly oddsApiUrlTemplate = "https://elitebet.cg/?view=event&id={eventId}";
    private readonly sourceName = "CG_ELITEBET";
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

        console.log('✅ EliteBet odds synced successfully!');
    }

    private async fetchAndSaveOdds(sourceFixtureId: string, eventTitle: string, fixtureId: number) {
        const apiUrl = this.oddsApiUrlTemplate.replace('{eventId}', sourceFixtureId);
        const response = await fetchFromApiWithoutProxy(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
            }
        });

        const odds = this.extractOdds(response);
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

        // Save all odds
        await save('1X2', '1', odds.homeWin ?? '0');
        await save('1X2', 'X', odds.draw ?? '0');
        await save('1X2', '2', odds.awayWin ?? '0');
        await save('Both Teams to Score', 'Yes', odds.bttsYes ?? '0');
        await save('Both Teams to Score', 'No', odds.bttsNo ?? '0');

        // Save Over/Under 2.5 odds
        const ou25 = odds.overUnder['2.5'];
        if (ou25) {
            await save('Over / Under', 'Over', ou25.over ?? '0');
            await save('Over / Under', 'Under', ou25.under ?? '0');
        }
    }

    private extractOdds(html: string): OddsOutput {
        const root = parse(html);
        const result: OddsOutput = { overUnder: {} };

        // Extract 1X2 odds directly by market header
        const matchBettingHeader = Array.from(root.querySelectorAll('.market_key_header'))
            .find(header => header.textContent?.includes('Paris sur le match'));

        if (matchBettingHeader) {
            const marketDiv = matchBettingHeader.parentNode?.querySelector('.markets');
            if (marketDiv) {
                result.homeWin = marketDiv.querySelector('.selection_name.with_line:contains("1") + .odds')?.text.trim();
                result.draw = marketDiv.querySelector('.selection_name.with_line:contains("X") + .odds')?.text.trim();
                result.awayWin = marketDiv.querySelector('.selection_name.with_line:contains("2") + .odds')?.text.trim();
            }
        }

        // Extract BTTS odds directly by market header
        const bttsHeader = Array.from(root.querySelectorAll('.market_key_header'))
            .find(header => header.textContent?.includes('Les deux equipes marquent'));

        if (bttsHeader) {
            const marketDiv = bttsHeader.parentNode?.querySelector('.markets');
            if (marketDiv) {
                result.bttsYes = marketDiv.querySelector('.selection_name.with_line:contains("Oui") + .odds')?.text.trim();
                result.bttsNo = marketDiv.querySelector('.selection_name.with_line:contains("Non") + .odds')?.text.trim();
            }
        }

        // Extract Over/Under 2.5 odds directly by market header
        const overUnderHeader = Array.from(root.querySelectorAll('.market_header'))
            .find(header => header.textContent?.includes('2.5'));

        if (overUnderHeader) {
            const marketDiv = overUnderHeader.parentNode;
            if (marketDiv) {
                result.overUnder['2.5'] = {
                    under: marketDiv.querySelector('.selection_name.with_line:contains("-") + .odds')?.text.trim(),
                    over: marketDiv.querySelector('.selection_name.with_line:contains("+") + .odds')?.text.trim()
                };
            }
        }

        return result;
    }
}