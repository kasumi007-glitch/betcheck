import { db } from "../../../infrastructure/database/Database";
import { httpClientFromApi as httpClientCI } from "../../../utils/HttpClientCI";
import { httpClientFromApi as httpClientSN } from "../../../utils/HttpClientSN";
import { httpClientFromApi as httpClientBJ } from "../../../utils/HttpClientBJ";
import { OddsSnapshotService } from "../../../utils/OddsSnapshotService";

class FetchCiBetclicOddService {
    // private readonly baseUrl = "https://www.betclic.ci/football-sfootball";
    // private readonly sourceName = "CI_BETCLIC";
    private sourceId!: number;
    private httpClient!: (url: string) => Promise<any>;
    private apiUrlTemplate!: string;
    private dbGroups: any[] = [];
    private dbMarkets: any[] = [];

    // Define market group mappings
    private readonly groupMapping: Record<string, string> = {
        "Résultat du match (tps rég.)": "1X2",
        "But pour les 2 équipes": "Both Teams to Score",
        "Nombre total de buts": "Over / Under"
    };

    // Define market name mappings
    private readonly marketMapping: Record<string, Record<string, string>> = {
        "1X2": {
            "1": "1",
            "Nul": "X",
            "2": "2"
        },
        "Both Teams to Score": {
            "Oui": "Yes",
            "Non": "No"
        },
        "Over / Under": {
            "+ de 2,5": "Over",
            "- de 2,5": "Under"
        }
    };

    async init(sourceName: string) {
        switch (sourceName.toUpperCase()) {
            case "CI_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.ci/football-sfootball";
                this.httpClient = httpClientCI;
                break;

            case "SN_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.sn/football-sfootball";
                this.httpClient = httpClientSN;
                break;

            case "BJ_BETCLIC":
                this.apiUrlTemplate = "https://www.betclic.bj/football-sfootball";
                this.httpClient = httpClientBJ;
                break;

            default:
                throw new Error(`Unknown source: ${sourceName}`);
        }
        const source = await db("sources").where("name", sourceName).first();
        this.sourceId = source ? source.id : (await db("sources").insert({ name: sourceName }).returning("id"))[0];
        this.dbGroups = await db("groups");
        this.dbMarkets = await db("markets");
    }

    async syncOdds(sourceName: string) {
        await this.init(sourceName);
        console.log(`🚀 Fetching odds from ${sourceName}...`);

        const fixtures = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select(
                "source_matches.source_fixture_id",
                "source_matches.fixture_id",
                "source_matches.source_event_name",
                "source_matches.source_competition_id as source_league_id",
                "source_matches.source_competition_name as source_league_name"
            )
            .whereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.is_active", true)
            .andWhere("source_matches.source_id", this.sourceId);

        for (const match of fixtures) {
            await this.fetchOdds(match);
        }

        console.log(`✅ Odds synced successfully from ${sourceName}!`);
    }

    private async fetchOdds(match: any) {
        try {
            const leagueSlug = this.createLeagueSlug(match.source_league_name, match.source_league_id);
            const matchSlug = this.createMatchSlug(match.source_event_name, match.source_fixture_id);
            const url = `${this.apiUrlTemplate}/${leagueSlug}/${matchSlug}`;

            const response = await this.httpClient(url);
            const ngState = this.extractNgState(response);
            if (!ngState) return;

            await this.processOddsResponse(ngState, match.fixture_id, match.source_fixture_id, match.source_event_name);
        } catch (error) {
            console.error(`❌ Error fetching odds for fixture ${match.source_fixture_id}:`, error instanceof Error ? error.message : error);
        }
    }

    private createLeagueSlug(competitionName: string, competitionId: string): string {
        return competitionName
            .toLowerCase()
            .replace(/\./g, "")
            .replace(/\s+/g, "-")
            .replace(/--/g, "-") + `-c${competitionId}`;
    }

    private createMatchSlug(matchName: string, matchId: string): string {
        if (!matchName || !matchId) return `m${matchId}`;

        // Convert "Liverpool - Bournemouth" to "liverpool-bournemouth"
        const slug = matchName
            .toLowerCase()
            .replace(/\s+/g, '-')      // Replace spaces with -
            .replace(/[^a-z0-9-]/g, '') // Remove all non-word chars
            .replace(/--+/g, '-')       // Replace multiple - with single -
            .replace(/^-+/, '')         // Trim - from start of text
            .replace(/-+$/, '');        // Trim - from end of text

        return `${slug}-m${matchId}`;
    }

    private extractNgState(response: string): any {
        const ngStateRegex = /<script id="ng-state" type="application\/json">({.+?})<\/script>/;
        const match = response.match(ngStateRegex);
        if (!match) return null;

        try {
            const json = JSON.parse(match[1]);
            // Find the grpc response that contains match data with subCategories
            for (const key in json) {
                if (json[key]?.response?.payload?.match?.subCategories) {
                    return json[key].response;
                }
            }
            return null;
        } catch (error) {
            console.error("Error parsing ng-state JSON:", error);
            return null;
        }
    }

    private async processOddsResponse(response: any, fixtureId: number, sourceFixtureId: string, eventName: string) {
        const markets = response?.payload?.match?.subCategories?.[0]?.markets || [];

        const filteredMarkets = (markets ?? []).filter((market: any) => this.groupMapping[market.name]);
        for (const market of filteredMarkets) {
            const marketType = this.groupMapping[market.name] || market.name;
            const dbGroup = this.dbGroups.find(g => g.group_name === marketType);
            if (!dbGroup) continue;

            if (marketType === "1X2" && market.mainSelections) {
                await this.process1X2Market(market.mainSelections, dbGroup.group_id, fixtureId, sourceFixtureId, eventName);
            } else if (marketType === "Both Teams to Score" && market.selectionMatrix?.[0]?.selections) {
                await this.processBTTSMarket(market.selectionMatrix[0].selections, dbGroup.group_id, fixtureId, sourceFixtureId);
            } else if (marketType === "Over / Under" && market.selectionMatrix.length) {
                await this.processOverUnderMarket(market.selectionMatrix, dbGroup.group_id, fixtureId, sourceFixtureId);
            }
        }
    }

    private async process1X2Market(selections: any[], groupId: number, fixtureId: number, sourceFixtureId: string, eventName: string) {
        const [homeTeamName, awayTeamName] = eventName.split(" - ").map((s: string) => s.trim());
        const dbMarket1 = this.dbMarkets.find(m => m.group_id === groupId && m.market_name === "1");
        const dbMarketX = this.dbMarkets.find(m => m.group_id === groupId && m.market_name === "X");
        const dbMarket2 = this.dbMarkets.find(m => m.group_id === groupId && m.market_name === "2");

        for (const selection of selections) {
            let marketId: number | undefined;
            if (selection.name === homeTeamName) {
                marketId = dbMarket1?.market_id;
            } else if (selection.name === "Nul") {
                marketId = dbMarketX?.market_id;
            } else if (selection.name === awayTeamName) {
                marketId = dbMarket2?.market_id;
            }

            if (marketId && selection.odds) {
                await OddsSnapshotService.saveOrUpdate({
                    group_id: groupId,
                    market_id: marketId,
                    fixture_id: fixtureId,
                    source_id: this.sourceId,
                    external_source_fixture_id: sourceFixtureId,
                    coefficient: parseFloat(selection.odds),
                });
            }
        }
    }

    private async processBTTSMarket(selections: any[], groupId: number, fixtureId: number, sourceFixtureId: string) {
        const dbMarketYes = this.dbMarkets.find(m => m.group_id === groupId && m.market_name === "Yes");
        const dbMarketNo = this.dbMarkets.find(m => m.group_id === groupId && m.market_name === "No");

        for (const selection of selections) {
            const selectionData = selection.selectionOneof?.selection;
            if (!selectionData) continue;

            let marketId: number | undefined;
            if (selectionData.name === "Oui" || selectionData.name === "Yes") {
                marketId = dbMarketYes?.market_id;
            } else if (selectionData.name === "Non" || selectionData.name === "No") {
                marketId = dbMarketNo?.market_id;
            }

            if (marketId && selectionData.odds) {
                await OddsSnapshotService.saveOrUpdate({
                    group_id: groupId,
                    market_id: marketId,
                    fixture_id: fixtureId,
                    source_id: this.sourceId,
                    external_source_fixture_id: sourceFixtureId,
                    coefficient: parseFloat(selectionData.odds),
                });
            }
        }
    }

    private async processOverUnderMarket(selections: any[], groupId: number, fixtureId: number, sourceFixtureId: string) {
        // Only process Over/Under 2.5 as requested
        const dbMarketOver = this.dbMarkets.find(m => m.group_id === groupId && m.market_name === "Over");
        const dbMarketUnder = this.dbMarkets.find(m => m.group_id === groupId && m.market_name === "Under");

        for (const selection of selections) {
            for (const selectionOne of selection.selections) {
                const selectionData = selectionOne.selectionOneof?.selection;
                if (!selectionData) continue;

                // Only process if it's specifically 2.5
                if (!selectionData.name.includes("2,5") && !selectionData.name.includes("2.5")) continue;

                let marketId: number | undefined;
                if (selectionData.name.includes("+") || selectionData.name.includes("Over")) {
                    marketId = dbMarketOver?.market_id;
                } else if (selectionData.name.includes("-") || selectionData.name.includes("Under")) {
                    marketId = dbMarketUnder?.market_id;
                }

                if (marketId && selectionData.odds) {
                    await OddsSnapshotService.saveOrUpdate({
                        group_id: groupId,
                        market_id: marketId,
                        fixture_id: fixtureId,
                        source_id: this.sourceId,
                        external_source_fixture_id: sourceFixtureId,
                        coefficient: parseFloat(selectionData.odds),
                    });
                }
            }
        }
    }
}

export default FetchCiBetclicOddService;