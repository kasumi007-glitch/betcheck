import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";
import WebSocket from "ws";

const WS_URL = "wss://eu-swarm-newm.betconstruct.com/";
const ORIGIN = "https://www.betmomo.com";
const SITE_ID = "211";
const SOURCE_ID = 42;
const AFEC = "P9EBYw5HoTklIVwKl52f3B7g6W7LKGpb_BhU";
const proxies = ["v2.proxyempire.io:5000:r_5bc8550750-country-za-sid-4gg37821:77dc4d16bf"];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const CONNECTION_TIMEOUT_MS = 15000;
const PROCESSING_TIMEOUT_MS = 60000;

interface Game {
    id: number;
    team1_name: string;
    team2_name: string;
    start_ts: number;
}

interface LeagueInfo {
    country: string;
    regionId: number;
    id: number;
    name: string;
}

class SaveBetmomoLeaguesWithFixturesService {
    private jsonData: Record<string, any> = {};

    async syncLeaguesAndFixtures() {
        const leagues = await this.fetchLeaguesFromWebSocket();
        for (const league of leagues) {
            console.log(`⚽ Processing league: ${league.name}`);
            // await this.fetchFixturesFromWebSocket(league);
            await this.retryWithBackoff(() => this.fetchFixturesFromWebSocket(league), `Fixtures for ${league.name}`);
        }

        const today = new Date();
        const dateStr = today.toISOString().split("T")[0];
        const filePath = `./files/common/betmomo_countries_leagues_fixtures_${dateStr}.json`;
        // const filePath = `./files/${this.countryCode}_betmomo_countries_leagues_fixtures_${dateStr}.json`;

        fs.writeFileSync(filePath, JSON.stringify(this.jsonData, null, 2));
        console.log(`✅ JSON file generated: ${filePath}`);
    }

    private async retryWithBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
        let attempt = 0;
        while (attempt < MAX_RETRIES) {
            try {
                return await fn();
            } catch (error) {
                attempt++;
                console.error(`❌ ${label} - Attempt ${attempt} failed:`, error instanceof Error ? error.message : String(error));
                if (attempt < MAX_RETRIES) {
                    await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
                }
            }
        }
        throw new Error(`❌ Failed to fetch ${label} after ${MAX_RETRIES} attempts`);
    }

    private createWebSocket(): WebSocket {
        const [host, port, username, password] = proxies[0].split(":");
        const proxyUrl = `http://${username}:${password}@${host}:${port}`;
        const agent = new HttpsProxyAgent(proxyUrl);

        return new WebSocket(WS_URL, {
            origin: ORIGIN,
            agent: agent
        });
    }

    private fetchLeaguesFromWebSocket(): Promise<LeagueInfo[]> {
        return new Promise((resolve) => {
            // const ws = this.createWebSocket();
            const ws = new WebSocket(WS_URL, { origin: ORIGIN });

            // const ws = new WebSocket(WS_URL, { origin: ORIGIN });
            const leagues: LeagueInfo[] = [];

            ws.on("open", () => {
                const sessionRequest = {
                    command: "request_session",
                    params: {
                        language: "eng",
                        site_id: SITE_ID,
                        source: SOURCE_ID,
                        // release_date: '06/05/2025-17:32',
                        afec: AFEC,
                    },
                    rid: `request_session${Date.now()}`,
                };
                ws.send(JSON.stringify(sessionRequest));
            });

            ws.on("message", (data: WebSocket.Data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.code === 0 && response.rid?.startsWith("request_session")) {
                        const leaguesRequest = {
                            command: "get",
                            params: {
                                source: "betting",
                                what: {
                                    region: ["name", "alias", "order", "id", "competition"],
                                    competition: ["name", "order", "id", "favorite_order"],
                                },
                                where: {
                                    sport: {
                                        alias: "Soccer",
                                        type: { "@in": [0, 2, 5] },
                                    },
                                    game: {
                                        "@or": [
                                            { type: { "@in": [0, 2] } },
                                            { visible_in_prematch: 1 },
                                        ],
                                    },
                                },
                                subscribe: true,
                            },
                            rid: `Prematch_SoccerSubscribeCmd${Date.now()}`,
                        };
                        ws.send(JSON.stringify(leaguesRequest));
                    } else if (response.rid?.startsWith("Prematch_SoccerSubscribeCmd") && response.code === 0) {
                        for (const regionId in response.data.data.region) {
                            const region = response.data.data.region[regionId];
                            // if (region.name !== "Spain") continue;
                            for (const compId in region.competition) {
                                const comp = region.competition[compId];
                                leagues.push({
                                    country: region.name,
                                    regionId: region.id,
                                    id: comp.id,
                                    name: comp.name
                                });
                            }
                        }
                        ws.close();
                        resolve(leagues);
                    }
                } catch {
                    ws.close();
                    resolve(leagues);
                }
            });

            ws.on("error", () => resolve(leagues));
            ws.on("close", () => resolve(leagues));
        });
    }

    private fetchFixturesFromWebSocket(league: LeagueInfo): Promise<void> {
        return new Promise((resolve) => {
            // const ws = this.createWebSocket();

            const ws = new WebSocket(WS_URL, { origin: ORIGIN });

            ws.on("open", () => {
                const sessionRequest = {
                    command: "request_session",
                    params: {
                        language: "eng",
                        site_id: SITE_ID,
                        source: SOURCE_ID,
                        // release_date: '06/05/2025-17:32',c
                        afec: AFEC,
                    },
                    rid: `request_session${Date.now()}`,
                };
                ws.send(JSON.stringify(sessionRequest));
            });

            ws.on("message", (data: WebSocket.Data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.code === 0 && response.rid?.startsWith("request_session")) {
                        const fixturesRequest = {
                            command: "get",
                            params: {
                                source: "betting",
                                what: {
                                    sport: ["alias"],
                                    region: ["id"],
                                    competition: ["id"],
                                    game: ["id", "team1_name", "team2_name", "start_ts"],
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
                                        id: league.regionId
                                    },
                                    competition: {
                                        id: league.id
                                    }
                                },
                                subscribe: true,
                            },
                            rid: `GameListSubscribeCmd${Date.now()}`,
                        };
                        ws.send(JSON.stringify(fixturesRequest));
                    } else if (response.rid?.startsWith("GameListSubscribeCmd") && response.code === 0) {
                        const sportsData = response.data.data.sport;

                        for (const sportId in sportsData) {
                            const sport = sportsData[sportId];
                            if (sport.alias !== "Soccer") continue;

                            for (const regionId in sport.region) {
                                const region = sport.region[regionId];
                                if (region.id !== league.regionId) continue;

                                for (const compId in region.competition) {
                                    const comp = region.competition[compId];
                                    if (comp.id !== league.id) continue;

                                    const games = comp.game ?? {};
                                    if (!this.jsonData[league.country]) {
                                        this.jsonData[league.country] = { leagues: {} };
                                    }

                                    this.jsonData[league.country].leagues[league.id] = {
                                        name: league.name,
                                        fixtures: []
                                    };

                                    for (const gameId in games) {
                                        const game: Game = games[gameId];
                                        const homeTeam = game.team1_name?.trim() ?? "";
                                        const awayTeam = game.team2_name?.trim() ?? "";

                                        if (homeTeam && awayTeam) {
                                            const fixtures = this.jsonData[league.country].leagues[league.id].fixtures;
                                            if (!fixtures.includes(homeTeam)) fixtures.push(homeTeam);
                                            if (!fixtures.includes(awayTeam)) fixtures.push(awayTeam);
                                        }
                                    }
                                }
                            }
                        }

                        ws.close();
                        resolve();
                    }
                } catch {
                    ws.close();
                    resolve();
                }
            });

            ws.on("error", () => resolve());
            ws.on("close", () => resolve());
        });
    }
}


export default new SaveBetmomoLeaguesWithFixturesService();