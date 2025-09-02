import { db } from "../../infrastructure/database/Database";
import WebSocket from "ws";

interface Region {
    id: number;
    name: string;
    alias: string;
    order: number;
    competition: Record<string, Competition>;
}

interface Competition {
    id: number;
    name: string;
    order: number;
    favorite_order: number | null;
}

class FetchBetmomoLeaguesService {
    private WS_URL!: string;
    private ORIGIN!: string;
    private SITE_ID!: string;
    private AFEC!: string;
    private SOURCE_ID!: number;

    // private apiUrlTemplate!: string;
    private sourceId!: number;
    private countryNameMappings: Record<string, string> = {};
    private leagueNameMappings: Record<string, { name: string; mapped_name: string }[]> = {};

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
        await this.loadCountryNameMappings();
        await this.loadLeagueNameMappings();
    }

    async syncLeagues(sourceName: string) {
        await this.init(sourceName);
        await this.fetchLeaguesFromWebSocket();
        console.log("🚀 Fetching BetMomo leagues...");
    }

    private fetchLeaguesFromWebSocket(): Promise<void> {
        return new Promise((resolve) => {
            const ws = new WebSocket(this.WS_URL, { origin: this.ORIGIN });

            const OPEN_TIMEOUT_MS = 5000;
            const openTimeout = setTimeout(() => {
                console.error(`⏱️ WebSocket did not open after ${OPEN_TIMEOUT_MS} ms; terminating.`);
                ws.terminate();
                resolve();
            }, OPEN_TIMEOUT_MS);

            let sessionEstablished = false;
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

                        // Now send the leagues request
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
                        return;
                    }

                    if (response.rid?.startsWith("Prematch_SoccerSubscribeCmd") && response.code === 0) {
                        handled = true; // ✅ Mark as handled
                        await this.processLeaguesResponse(response.data.data.region);
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

    private async processLeaguesResponse(regions: Record<string, Region>) {
        for (const regionId in regions) {
            const region = regions[regionId];
            if (!region.name || !region.competition) continue;

            const mappedCountry = this.countryNameMappings[region.name] ?? region.name;

            const dbCountry = await db("countries")
                .where("name", mappedCountry)
                .andWhere("is_active", true)
                .first();

            if (!dbCountry) {
                console.warn(`⚠️ Country not found in database: ${mappedCountry}`);
                continue;
            }

            // if (dbCountry.name !== "England") continue;

            for (const competitionId in region.competition) {
                const competition = region.competition[competitionId];
                const leagueName = competition.name;

                const mappings = this.leagueNameMappings[dbCountry.code] ?? [];
                const mappedLeague = mappings.find(m => m.mapped_name === leagueName)?.name ?? leagueName;

                const dbLeague = await db("leagues")
                    .where("name", mappedLeague)
                    .andWhere("country_code", dbCountry.code)
                    .andWhere("is_active", true)
                    .first();

                if (!dbLeague) {
                    console.warn(`⚠️ League not found: ${mappedLeague} (Country: ${dbCountry.name})`);
                    continue;
                }

                const result = await db("source_league_matches")
                    .insert({
                        source_league_id: competition.id.toString(),
                        source_league_name: leagueName,
                        source_country_name: region.name,
                        source_country_id: region.id.toString(),
                        league_id: dbLeague.id,
                        country_code: dbCountry.code,
                        source_id: this.sourceId
                    })
                    .onConflict(["league_id", "source_id", "source_league_id"])
                    .ignore()
                    .returning("*");

                if (result.length > 0) {
                    console.log(`✅ Inserted league: ${mappedLeague} (Country: ${dbCountry.name}, League ID: ${dbLeague.id})`);
                } else {
                    console.warn(`⚠️ Duplicate ignored: ${mappedLeague} (League ID: ${dbLeague.id})`);
                }
            }
        }
    }

    private async loadCountryNameMappings() {
        const mappings = await db("country_name_mappings").select("name", "mapped_name");
        this.countryNameMappings = mappings.reduce((acc, m) => ({ ...acc, [m.mapped_name]: m.name }), {});
    }

    private async loadLeagueNameMappings() {
        const mappings = await db("league_name_mappings as lm")
            .join("leagues as l", "lm.league_id", "=", "l.external_id")
            .join("countries as c", "l.country_code", "=", "c.code")
            .where("c.is_active", true)
            .select("lm.name", "lm.mapped_name", "l.country_code");
        this.leagueNameMappings = mappings.reduce((acc, m) => {
            if (!acc[m.country_code]) acc[m.country_code] = [];
            acc[m.country_code].push({ name: m.name, mapped_name: m.mapped_name });
            return acc;
        }, {} as Record<string, { name: string; mapped_name: string }[]>);
    }
}

export default FetchBetmomoLeaguesService;