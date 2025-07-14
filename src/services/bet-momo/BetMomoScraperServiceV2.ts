// This is a full conversion of the BetMomo scraper using Playwright
// It preserves all original DB logic, mappings, and fixture filtering from your Puppeteer version
// Optimizations: headless scraping, blocked resources, improved performance

import { chromium, Page, ElementHandle } from 'playwright';
import { db } from '../../infrastructure/database/Database';
import Group from '../../models/Group';
import Market from '../../models/Market';

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

class BetMomoScraperV2Service {
  private readonly sourceName = 'BETMOMO';
  private sourceId!: number;
  private dbGroups: Group[] = [];
  private dbMarkets: Market[] = [];
  private countryNameMappings: Record<string, string> = {};
  private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};
  private teamNameMappings: Record<number, { name: string; mapped_name: string }[]> = {};

  async init() {
    const source = await db('sources').where('name', this.sourceName).first();
    if (!source) {
      [this.sourceId] = await db('sources').insert({ name: this.sourceName }).returning('id');
    } else {
      this.sourceId = source.id;
    }
    this.dbGroups = await db('groups');
    this.dbMarkets = await db('markets');
    await this.loadCountryNameMappings();
    await this.loadLeagueNameMappings();
    await this.loadTeamNameMappings();
  }

  async scrape(): Promise<void> {
    await this.init();
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    // await context.route('**/*', route => {
    //   const type = route.request().resourceType();
    //   if (["image", "stylesheet", "font"].includes(type)) route.abort();
    //   else route.continue();
    // });
    const page = await context.newPage();

    await page.goto('https://www.betmomo.com/en/sports/pre-match/event-view/Soccer', {
      waitUntil: 'networkidle'
    });

    // await page.waitForSelector('.sp-sub-list-bc.Soccer.active.selected');
    const section = await page.waitForSelector('.sp-sub-list-bc.Soccer.active.selected', {
      timeout: 40000,
      state: 'attached'
    }).catch(() => null);

    if (!section) {
      console.error('❌ Soccer section not found — selector may be missing or blocked.');
      await browser.close();
      return;
    }
    await page.evaluate(() => {
      document.querySelector('.popup-holder-bc.windowed.info')?.remove();
    });

    let countryElements = await page.$$('.sp-sub-list-bc.Soccer.active.selected .sp-s-l-head-bc');
    for (let i = 0; i < countryElements.length; i++) {
      const countryName = await countryElements[i].getAttribute('title') ?? await countryElements[i].textContent() ?? '';
      if (countryName === "Football" && i + 1 < countryElements.length) {
        const nextCountry = countryElements[i + 1];
        const nextCountryName = await nextCountry.getAttribute('title') ?? await nextCountry.textContent() ?? '';
        console.log(`🔽 Collapsing country after \"Football\": ${nextCountryName}`);
        await nextCountry.click();
        await page.waitForTimeout(3000);
        countryElements = await page.$$('.sp-sub-list-bc.Soccer.active.selected .sp-s-l-head-bc');
        break;
      }
    }

    for (const countryEl of countryElements) {
      const countryName = await countryEl.getAttribute('title') ?? await countryEl.textContent() ?? '';
      if (!countryName || countryName === 'Football') continue;
      try {
        await countryEl.click();
        await page.waitForTimeout(3000);
      } catch (err) {
        console.warn(`⚠️ Could not click country: ${countryName}`, err);
        continue;
      }

      const mappedCountryName = this.countryNameMappings[countryName.trim()] ?? countryName.trim();
      const dbCountry = await db('countries').where('name', mappedCountryName).andWhere('is_active', true).first();
      if (!dbCountry) continue;

      const containerHandle = await countryEl.evaluateHandle(el => el.nextElementSibling);
      const leagues = await containerHandle.evaluate((container: any) => {
        return Array.from(container.querySelectorAll('.sp-sub-list-bc .sp-s-l-head-bc')).map((l: any) => l.getAttribute('title') ?? l.textContent?.trim()).filter(Boolean);
      });

      for (const league of leagues) {
        const mappings = this.leagueNameMappings[dbCountry.code] ?? [];
        const mapping = mappings.find(m => m.mapped_name === league);
        const mappedLeague = mapping ? mapping.name : league;
        const dbLeague = await db('leagues').where('name', mappedLeague).andWhere('country_code', dbCountry.code).andWhere('is_active', true).first();
        if (!dbLeague) continue;

        const leagueElement = await containerHandle.asElement()?.$(`.sp-s-l-head-bc[title="${league}"]`);
        if (!leagueElement) continue;

        try {
          await leagueElement.click();
          await page.waitForTimeout(2000);
          const matchHandles = await page.$$('.multi-column-content li');

          for (const matchHandle of matchHandles) {
            const matchInfo = await matchHandle.evaluate((el: any) => {
              const teams = Array.from(el.querySelectorAll('.multi-column-single-team p')).map((t: any) => t.textContent?.trim()).filter(Boolean);
              const time = el.querySelector('.multi-column-time-icon time')?.textContent?.trim() ?? '';
              const dateEl = el.closest('.competition-bc')?.querySelector('time.c-title-bc.ellipsis');
              const date = dateEl?.textContent?.trim() ?? '';
              return { teams, time, date };
            });

            if (!matchInfo.teams.length) continue;
            await matchHandle.click();
            await page.waitForSelector('.sgm-body-bc', { timeout: 10000 }).catch(() => { });
            await page.waitForTimeout(1000);

            const oddsData = await this.extractOdds(page);
            oddsData.external_source_fixture_id = 1;

            const teamMappings = this.teamNameMappings[dbLeague.external_id] || [];
            const home = teamMappings.find(m => m.mapped_name === matchInfo.teams[0])?.name ?? matchInfo.teams[0];
            const away = teamMappings.find(m => m.mapped_name === matchInfo.teams[1])?.name ?? matchInfo.teams[1];

            const [day, month, year] = matchInfo.date.split('.') ?? [];
            if (!day || !month || !year) continue;
            const eventDate = new Date(`${year}-${month}-${day}T${matchInfo.time}:00`);
            if (isNaN(eventDate.getTime()) || eventDate < new Date()) continue;

            const fixture = await db('fixtures')
              .join('leagues', 'fixtures.league_id', '=', 'leagues.external_id')
              .select('fixtures.*')
              .whereRaw('LOWER(home_team_name) ILIKE LOWER(?) AND LOWER(away_team_name) ILIKE LOWER(?)', [`%${home}%`, `%${away}%`])
              .andWhere('fixtures.league_id', dbLeague.external_id)
              .andWhere('date', '>=', new Date())
              .first();

            if (!fixture) continue;
            await this.processOddsMapping(fixture.id, oddsData);
            await page.goBack({ waitUntil: 'networkidle' });
          }
        } catch (e) {
          console.error(`❌ Failed to process league: ${league}`, e);
        }
      }
    }

    await browser.close();
    console.log('✅ Done scraping.');
  }

  private async extractOdds(page: Page): Promise<OddsData> {
    return page.evaluate(() => {
      const getOdds = (market: string): string[] => {
        const el = Array.from(document.querySelectorAll('.sgm-market-g')).find(m => m.querySelector('.sgm-market-g-h-title-bc')?.getAttribute('title')?.trim() === market);
        if (!el) return [];
        return Array.from(el.querySelectorAll('.market-odd-bc')).map(n => n.textContent?.trim() || 'N/A');
      };

      const extractTotal = (): { over: string; under: string } => {
        const el = Array.from(document.querySelectorAll('.sgm-market-g')).find(m => m.querySelector('.sgm-market-g-h-title-bc')?.getAttribute('title') === 'Total Goals');
        const cells = el ? Array.from(el.querySelectorAll('.sgm-market-g-i-cell-bc.market-bc')).filter(cell => cell.querySelector('.market-name-bc')?.textContent?.trim() === '2.5') : [];
        return {
          over: cells[0]?.querySelector('.market-odd-bc')?.textContent?.trim() || 'N/A',
          under: cells[1]?.querySelector('.market-odd-bc')?.textContent?.trim() || 'N/A',
        };
      };

      return {
        matchResult: { home: getOdds('Match Result')[0] || 'N/A', draw: getOdds('Match Result')[1] || 'N/A', away: getOdds('Match Result')[2] || 'N/A' },
        bothTeams: { yes: getOdds('Both Teams To Score')[0] || 'N/A', no: getOdds('Both Teams To Score')[1] || 'N/A' },
        totalGoals: extractTotal()
      };
    });
  }

  private async processOddsMapping(fixtureId: number, odds: OddsData): Promise<void> {
    const mapGroup: Record<string, string> = {
      "1x2": "1X2",
      "Both Teams To Score": "Both Teams to Score",
      Total: "Over / Under"
    };

    const outcomeMap: Record<string, string> = {
      "1": "1", x: "X", "2": "2", total_over__2_5: "Over", total_under_2_5: "Under", yes: "Yes", no: "No"
    };

    const save = async (groupKey: string, outcomes: { alias: string, coefficient: number }[]) => {
      const groupName = mapGroup[groupKey];
      const dbGroup = this.dbGroups.find(g => g.group_name === groupName);
      if (!dbGroup) return;
      for (const outcome of outcomes) {
        const marketName = outcomeMap[outcome.alias];
        const dbMarket = this.dbMarkets.find(m => m.market_name.toLowerCase() === marketName.toLowerCase() && m.group_id === dbGroup.group_id);
        if (!dbMarket) continue;
        await db('fixture_odds')
          .insert({
            group_id: dbGroup.group_id,
            market_id: dbMarket.market_id,
            coefficient: outcome.coefficient,
            fixture_id: fixtureId,
            external_source_fixture_id: String(odds.external_source_fixture_id),
            source_id: this.sourceId
          })
          .onConflict(['group_id', 'market_id', 'fixture_id', 'external_source_fixture_id', 'source_id'])
          .merge({ coefficient: db.raw('EXCLUDED.coefficient'), updated_at: db.fn.now() });
      }
    };

    if (odds.matchResult) await save("1x2", [
      { alias: "1", coefficient: Number(odds.matchResult.home) },
      { alias: "x", coefficient: Number(odds.matchResult.draw) },
      { alias: "2", coefficient: Number(odds.matchResult.away) }
    ]);

    if (odds.bothTeams) await save("Both Teams To Score", [
      { alias: "yes", coefficient: Number(odds.bothTeams.yes) },
      { alias: "no", coefficient: Number(odds.bothTeams.no) }
    ]);

    if (odds.totalGoals) await save("Total", [
      { alias: "total_over__2_5", coefficient: Number(odds.totalGoals.over) },
      { alias: "total_under_2_5", coefficient: Number(odds.totalGoals.under) }
    ]);
  }

  private async loadCountryNameMappings() {
    const rows = await db('country_name_mappings').select('name', 'mapped_name');
    this.countryNameMappings = rows.reduce((acc, cur) => {
      acc[cur.mapped_name] = cur.name;
      return acc;
    }, {} as Record<string, string>);
  }

  private async loadLeagueNameMappings() {
    const rows = await db('league_name_mappings as lm')
      .join('leagues as l', 'lm.league_id', '=', 'l.external_id')
      .join('countries as c', 'l.country_code', '=', 'c.code')
      .where('c.is_active', true)
      .select('lm.name', 'lm.mapped_name', 'l.country_code');

    this.leagueNameMappings = rows.reduce((acc, cur) => {
      if (!acc[cur.country_code]) acc[cur.country_code] = [];
      acc[cur.country_code].push({ name: cur.name, mapped_name: cur.mapped_name });
      return acc;
    }, {} as Record<string, { name: string, mapped_name: string }[]>);
  }

  private async loadTeamNameMappings() {
    const rows = await db('team_name_mappings as tm')
      .join('leagues as l', 'tm.league_id', '=', 'l.external_id')
      .where('l.is_active', true)
      .select('tm.name', 'tm.mapped_name', 'l.external_id as league_id');

    this.teamNameMappings = rows.reduce((acc, cur) => {
      if (!acc[cur.league_id]) acc[cur.league_id] = [];
      acc[cur.league_id].push({ name: cur.name, mapped_name: cur.mapped_name });
      return acc;
    }, {} as Record<number, { name: string, mapped_name: string }[]>);
  }
}

export default new BetMomoScraperV2Service();
