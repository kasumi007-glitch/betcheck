import { db } from "../../infrastructure/database/Database";
import WebSocket from "ws";

interface Game {
    id: number;
    team1_name: string;
    team2_name: string;
    team1_id: number;
    team2_id: number;
    start_ts: number;
    markets_count: number;
    is_blocked: number;
    sportcast_id: number;
    is_stat_available: boolean;
    game_number: number;
}

class FetchBetmomoFixturesService {
    private WS_URL!: string;
    private ORIGIN!: string;
    private SITE_ID!: string;
    private AFEC!: string;
    private SOURCE_ID!: number;

    private sourceId!: number;
    private teamNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

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
        this.sourceId = source
            ? source.id
            : (await db("sources").insert({ name: sourceName }).returning("id"))[0];
        await this.loadTeamNameMappings();
    }

    async syncFixtures(sourceName: string) {
        await this.init(sourceName);

        const leagues = await db("source_league_matches")
            .join("leagues", "source_league_matches.league_id", "=", "leagues.id")
            .select(
                "source_league_matches.source_league_id",
                "source_league_matches.source_country_id",
                "leagues.external_id as league_id"
            )
            .where("source_league_matches.source_id", this.sourceId)
            .andWhere("leagues.is_active", true);

        for (const league of leagues) {
            await this.fetchFixturesFromWebSocket(league.source_country_id, league.source_league_id, league.league_id);
        }

        console.log("✅ Betmomo fixtures synced successfully!");
    }

    private fetchFixturesFromWebSocket(countryId: string, leagueId: string, dbLeagueId: number): Promise<void> {
        return new Promise((resolve) => {
            const ws = new WebSocket(this.WS_URL, { origin: this.ORIGIN });

            const OPEN_TIMEOUT_MS = 5000;
            const openTimeout = setTimeout(() => {
                console.error(`⏱️ WebSocket did not open after ${OPEN_TIMEOUT_MS} ms; terminating.`);
                ws.terminate();
                resolve();
            }, OPEN_TIMEOUT_MS);

            let sessionEstablished = false;
            let fixturesRequestSent = false;
            let handled = false; // ✅ Flag to prevent duplicate processing

            ws.on("open", () => {
                clearTimeout(openTimeout);
                console.log("✅ Connected to BetMomo WebSocket");

                // First send session request
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

                        // Now send the fixtures request
                        const fixturesRequest = {
                            command: "get",
                            params: {
                                source: "betting",
                                what: {
                                    sport: ["id", "name", "alias"],
                                    region: ["id", "name", "alias", "order"],
                                    competition: ["id", "name", "order"],
                                    game: [
                                        "id",
                                        "team1_name",
                                        "team2_name",
                                        "team1_id",
                                        "team2_id",
                                        "order",
                                        "start_ts",
                                        "markets_count",
                                        "is_blocked",
                                        "show_type",
                                        "sportcast_id",
                                        "is_stat_available",
                                        "game_number",
                                        "#sport:type"
                                    ],
                                },
                                where: {
                                    game: {
                                        "@or": [
                                            { type: { "@in": [0, 2] } },
                                            { visible_in_prematch: 1 },
                                        ]
                                    },
                                    sport: {
                                        alias: "Soccer",
                                        type: { "@in": [0, 2, 5] }
                                    },
                                    region: {
                                        id: parseInt(countryId)
                                    },
                                    competition: {
                                        id: parseInt(leagueId)
                                    }
                                },
                                subscribe: true
                            },
                            rid: `GameListSubscribeCmd${Date.now()}`,
                        };
                        ws.send(JSON.stringify(fixturesRequest));
                        fixturesRequestSent = true;
                        return;
                    }

                    if (fixturesRequestSent && response.rid?.startsWith("GameListSubscribeCmd") && response.code === 0) {
                        handled = true; // ✅ Mark as handled
                        await this.processFixturesResponse(response.data.data.sport, dbLeagueId);
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
                console.log("🔌 Disconnected from Trexname WebSocket");
                resolve();
            });
        });
    }

    private async processFixturesResponse(sportsData: Record<string, any>, leagueId: number) {
        for (const sportId in sportsData) {
            const sport = sportsData[sportId];
            if (sport.alias !== "Soccer") continue;

            for (const regionId in sport.region) {
                const region = sport.region[regionId];

                for (const competitionId in region.competition) {
                    const competition = region.competition[competitionId];

                    for (const gameId in competition.game) {
                        const game = competition.game[gameId] as Game;

                        const homeTeam = this.mapTeam(game.team1_name, leagueId) || game.team1_name;
                        const awayTeam = this.mapTeam(game.team2_name, leagueId) || game.team2_name;

                        const dbFixture = await db("fixtures")
                            .join("leagues", "fixtures.league_id", "=", "leagues.external_id")
                            .select("fixtures.*", "leagues.id as parent_league_id")
                            .whereRaw("LOWER(home_team_name) ILIKE ?", [`%${homeTeam?.toLowerCase()}%`])
                            .whereRaw("LOWER(away_team_name) ILIKE ?", [`%${awayTeam?.toLowerCase()}%`])
                            .andWhereRaw("fixtures.date >= NOW()")
                            .andWhere("leagues.external_id", leagueId)
                            .first();

                        if (!dbFixture) continue;

                        const result = await db("source_matches")
                            .insert({
                                source_fixture_id: game.id.toString(),
                                source_competition_id: competitionId,
                                source_event_name: `${homeTeam} vs ${awayTeam}`,
                                fixture_id: dbFixture.id,
                                competition_id: dbFixture.parent_league_id,
                                source_id: this.sourceId
                            })
                            .onConflict(["fixture_id", "source_id", "source_fixture_id"])
                            .ignore()
                            .returning("*");

                        if (result.length > 0) {
                            console.log(`✅ Inserted match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`);
                        } else {
                            console.warn(`⚠️ Ignored duplicate match: ${homeTeam} vs ${awayTeam} (Fixture ID: ${dbFixture.id})`);
                        }
                    }
                }
            }
        }
    }

    private mapTeam(teamName: string, leagueId: number): string {
        const mappings = this.teamNameMappings[leagueId] ?? [];
        return mappings.find(m => m.mapped_name === teamName)?.name ?? "";
    }

    private async loadTeamNameMappings() {
        const mappings = await db("team_name_mappings as tm")
            .join("leagues as l", "tm.league_id", "=", "l.external_id")
            .where("l.is_active", true)
            .select("tm.name", "tm.mapped_name", "l.external_id as league_id");

        this.teamNameMappings = mappings.reduce((acc, mapping) => {
            if (!acc[mapping.league_id]) acc[mapping.league_id] = [];
            acc[mapping.league_id].push({
                name: mapping.name,
                mapped_name: mapping.mapped_name
            });
            return acc;
        }, {} as Record<number, { name: string; mapped_name: string }[]>);
    }
}

export default FetchBetmomoFixturesService;