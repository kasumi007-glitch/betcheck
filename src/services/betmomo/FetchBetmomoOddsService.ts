import { db } from "../../infrastructure/database/Database";
import WebSocket from "ws";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { OddsSnapshotService } from "../../utils/OddsSnapshotService";

interface MarketData {
    type: string;
    market_type: string;
    name: string;
    order: number;
    main_order: number;
    id: number;
    base?: number;
    col_count: number;
    express_id: number;
    prematch_express_id: number;
    event: Record<string, EventData>;
}

interface EventData {
    id: number;
    name: string;
    price: number;
    base?: number;
    order: number;
    type_1: string;
}

class FetchBetmomoOddsService {
    private WS_URL!: string;
    private ORIGIN!: string;
    private SITE_ID!: string;
    private AFEC!: string;
    private SOURCE_ID!: number;

    private sourceId!: number;
    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];

    private readonly groupMapping: Record<string, string> = {
        "MatchResult": "1X2",
        "OverUnder": "Over / Under",
        "BothTeamsToScore": "Both Teams to Score"
    };

    private readonly marketMapping: Record<string, string> = {
        "W1": "1",
        "X": "X",
        "W2": "2",
        "Over": "Over",
        "Under": "Under",
        "Yes": "Yes",
        "No": "No"
    };

    async init(sourceName: string) {
        switch (sourceName.toUpperCase()) {
            case "AOMOBET":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.mobet.ao";
                this.SITE_ID = "18761547";
                this.AFEC = "JECx6S9e99ptR_MAQbCEV1HypGOIgrLY-c95";
                this.SOURCE_ID = 42;
                break;
            case "AOAFRIBET":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.afribet.ao";
                this.SITE_ID = "18760944";
                this.AFEC = "Fvp7dTJ9K7mBB0U3FW7SVMEA5MB2uiTzuizo";
                this.SOURCE_ID = 42;
                break;
            case "AOELEPHANTBET":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.elephantbet.co.ao";
                this.SITE_ID = "18756188";
                this.AFEC = "QaVakeYkJixV-DBRqxMbSHoOfm6qelnPkUUM";
                this.SOURCE_ID = 42;
                break;
            case "AOBANTUBET":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.bantubet.co.ao";
                this.SITE_ID = "1869146";
                this.AFEC = "R7TibjgaZb7fs0_CFQOW_-qfA-Vsji6655yg";
                this.SOURCE_ID = 42;
                break;
            case "BETMOMO":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.betmomo.com";
                this.SITE_ID = "211";
                this.AFEC = "P9EBYw5HoTklIVwKl52f3B7g6W7LKGpb_BhU";
                this.SOURCE_ID = 42;
                break;
            case "SLELEPHANTBET":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.elephantbet.sl";
                this.SITE_ID = "18756190";
                this.AFEC = "i1ge5_04UBXUmil96Etsx6lCL7Chnagx_-Tn";
                this.SOURCE_ID = 42;
                break;

            case "ZWAFRICABET":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.africabet.com";
                this.SITE_ID = "1877245";
                this.AFEC = "a0gMfPnVGNv6ZLVjBfWNZh_WMqcAWcuHuFKL";
                this.SOURCE_ID = 42;
                break;

            case "ML_BET223":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.bet2africa.ml";
                this.SITE_ID = "18756191";
                this.AFEC = "E_28EMugX904Ct5bGSQx0xRzJkIr9M3oVgDk";
                this.SOURCE_ID = 42;
                break;

            case "GA_BET223":
                this.WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
                this.ORIGIN = "https://www.bet2africa.ml";
                this.SITE_ID = "18756193";
                this.AFEC = "92ujSTnfgX12Mn5Zk4baNF8KMq2flajEPMf6";
                this.SOURCE_ID = 42;
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

        const fixtures = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "=", "fixtures.id")
            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
            .select("source_matches.source_fixture_id", "source_matches.source_event_name", "fixtures.id as fixture_id")
            .whereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.is_active", true)
            .andWhere("source_matches.source_id", this.sourceId);

        for (const match of fixtures) {
            console.log(`Fetching odds for fixture: ${match.source_event_name}`);
            await this.fetchOddsFromWebSocket(match.source_fixture_id, match.fixture_id);
        }
        console.log("✅ Betmomo odds synced successfully!");
    }

    private fetchOddsFromWebSocket(sourceFixtureId: string, fixtureId: number): Promise<void> {
        return new Promise((resolve) => {
            const ws = new WebSocket(this.WS_URL, { origin: this.ORIGIN });

            const OPEN_TIMEOUT_MS = 5000;
            const openTimeout = setTimeout(() => {
                console.error(`⏱️ WebSocket did not open after ${OPEN_TIMEOUT_MS} ms; terminating.`);
                ws.terminate();
                resolve();
            }, OPEN_TIMEOUT_MS);

            let sessionEstablished = false;
            let oddsRequestSent = false;
            let handled = false; // ✅ Flag to prevent duplicate processing

            ws.on("open", () => {
                clearTimeout(openTimeout);
                console.log("✅ Connected to Betmomo WebSocket");

                const sessionRequest = {
                    command: "request_session",
                    params: {
                        language: "eng",
                        site_id: this.SITE_ID,
                        source: this.SOURCE_ID,
                        // release_date: '06/05/2025-17:32',
                        afec: this.AFEC,
                    },
                    rid: `request_session${Date.now()}`,
                };
                ws.send(JSON.stringify(sessionRequest));
            });

            ws.on("message", async (data: WebSocket.Data) => {
                if (handled) return; // ✅ Ignore extra messages
                try {
                    const response = JSON.parse(data.toString());

                    if (!sessionEstablished && response.code === 0 && response.rid?.startsWith("request_session")) {
                        sessionEstablished = true;

                        const oddsRequest = {
                            command: "get",
                            params: {
                                source: "betting",
                                what: {
                                    sport: ["id", "name", "alias"],
                                    competition: ["name", "id"],
                                    game: [
                                        "id", "type", "team1_name", "team2_name", "team1_id", "team2_id", "info",
                                        "start_ts", "markets_count", "exclude_ids", "team1_reg_name", "team2_reg_name",
                                        "video_id", "video_id2", "stats", "score1", "score2", "show_type", "text_info",
                                        "is_stat_available", "is_started", "add_info_name", "tv_info", "sportcast_id",
                                        "match_length", "live_events", "is_blocked", "sport_alias", "#sport:type"
                                    ],
                                    market: [
                                        "type", "name", "order", "main_order", "id", "base", "express_id",
                                        "col_count", "group_id", "group_name", "cashout", "point_sequence", "sequence",
                                        "is_new", "market_type", "extra_info", "prematch_express_id", "has_early_payout"
                                    ],
                                    event: [
                                        "name", "id", "price", "base", "order", "type_1", "extra_info",
                                        "display_column", "ew_allowed"
                                    ],
                                    region: ["name", "alias"]
                                },
                                where: {
                                    sport: {
                                        alias: "Soccer"
                                    },
                                    game: {
                                        id: parseInt(sourceFixtureId),
                                        "@or": [
                                            { "type": { "@in": [0, 2] } },
                                            { "visible_in_prematch": 1 }
                                        ]
                                    },
                                    market: {
                                        "@or": [
                                            { market_type: "MatchResult" },
                                            { market_type: "OverUnder", base: 2.5 },
                                            { market_type: "BothTeamsToScore" }
                                        ]
                                    }
                                },
                                subscribe: true
                            },
                            rid: `SINGLE_GAME_VIEWSubscribeCmd${Date.now()}`,
                        };

                        ws.send(JSON.stringify(oddsRequest));
                        oddsRequestSent = true;
                        return;
                    }

                    if (oddsRequestSent && response.rid?.startsWith("SINGLE_GAME_VIEWSubscribeCmd") && response.code === 0) {
                        handled = true; // ✅ Mark as handled
                        await this.processOddsResponse(response.data.data.sport, fixtureId, sourceFixtureId);
                        ws.close();
                        resolve();
                    }

                } catch (error) {
                    console.error("Error processing WebSocket message:", error);
                    handled = true;
                    ws.close();
                    resolve();
                }
            });

            ws.on("error", (error) => {
                clearTimeout(openTimeout);
                console.error("WebSocket error:", error);
                resolve();
            });

            ws.on("close", () => {
                clearTimeout(openTimeout);
                console.log("🔌 Disconnected from Betmomo WebSocket");
                resolve();
            });
        });
    }


    private async processOddsResponse(sportsData: Record<string, any>, fixtureId: number, sourceFixtureId: string) {
        for (const sportId in sportsData) {
            const sport = sportsData[sportId];
            if (sport.alias !== "Soccer") continue;

            for (const regionId in sport.region) {
                const region = sport.region[regionId];

                for (const competitionId in region.competition) {
                    const competition = region.competition[competitionId];

                    for (const gameId in competition.game) {
                        const game = competition.game[gameId];

                        if (!game.market) continue;

                        for (const marketId in game.market) {
                            const marketData = game.market[marketId] as MarketData;
                            const groupName = this.groupMapping[marketData.market_type];

                            if (!groupName) continue;

                            const dbGroup = this.dbGroups.find(g => g.group_name.toLowerCase() === groupName.toLowerCase());
                            if (!dbGroup) continue;

                            for (const eventId in marketData.event) {
                                const event = marketData.event[eventId];
                                const marketName = this.marketMapping[event.type_1] || event.type_1;

                                const dbMarket = this.dbMarkets.find(m =>
                                    m.group_id === dbGroup.group_id &&
                                    m.market_name.toLowerCase() === marketName.toLowerCase()
                                );

                                if (!dbMarket) continue;

                                const coefficient = event.price;
                                if (typeof coefficient !== "number" || coefficient <= 0) continue;

                                await OddsSnapshotService.saveOrUpdate({
                                    group_id: dbGroup.group_id,
                                    market_id: dbMarket.market_id,
                                    fixture_id: fixtureId,
                                    source_id: this.sourceId,
                                    external_source_fixture_id: sourceFixtureId,
                                    coefficient,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}

export default FetchBetmomoOddsService;