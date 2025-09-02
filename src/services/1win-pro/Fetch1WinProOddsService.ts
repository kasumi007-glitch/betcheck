import { db } from "../../infrastructure/database/Database";
import WebSocket from "ws";
import Group from "../../models/Group";
import Market from "../../models/Market";
import { OddsSnapshotService } from "../../utils/OddsSnapshotService";

class Fetch1WinProOddsService {
    private readonly WS_URL =
        "wss://api-gateway.top-parser.com/push-server-v2/?Language=en-001&EIO=4&transport=websocket";
    private readonly sourceName = "1WINPRO";
    private sourceId!: number;

    private readonly groupMapping: Record<string, string> = {
        "Full time result": "1X2",
        "Both teams to score": "Both Teams to Score",
        Total: "Over / Under",
    };

    private readonly outcomeMapping: Record<string, string> = {
        "1": "1",
        "x": "X",
        "2": "2",
        yes: "Yes",
        no: "No",
        over: "Over",
        under: "Under",
    };

    private dbGroups: Group[] = [];
    private dbMarkets: Market[] = [];
    private ws: WebSocket | null = null;
    private timeout: NodeJS.Timeout | null = null;
    private isProcessingSnapshot = false;

    async init() {
        const source = await db("sources").where("name", this.sourceName).first();
        if (!source) {
            [this.sourceId] = await db("sources")
                .insert({ name: this.sourceName })
                .returning("id");
        } else {
            this.sourceId = source.id;
        }

        this.dbGroups = await db("groups");
        this.dbMarkets = await db("markets");
    }

    async syncOdds() {
        await this.init();
        console.log(`🚀 Syncing odds for ${this.sourceName}`);

        const fixtures = await db("source_matches")
            .join("fixtures", "source_matches.fixture_id", "fixtures.id")
            .join("leagues", "fixtures.league_id", "leagues.external_id")
            .select("source_matches.source_fixture_id", "fixtures.id")
            .whereRaw("fixtures.date >= NOW()")
            .andWhere("leagues.is_active", true)
            .andWhere("source_matches.source_id", this.sourceId);

        // Process fixtures sequentially with retries
        for (const fixture of fixtures) {
            let retries = 3;
            while (retries > 0) {
                console.log(`🔄 Processing fixture ${fixture.id} (${fixture.source_fixture_id}), attempts left: ${retries}`);
                try {
                    await this.processFixture(fixture.id, fixture.source_fixture_id);
                    console.log(`✅ Finished fixture ${fixture.id}`);
                    break; // Success, move to next fixture
                } catch (error) {
                    retries--;
                    if (retries === 0) {
                        console.error(`❌ Failed after 3 attempts for fixture ${fixture.id}:`, error);
                    } else {
                        console.warn(`⚠️ Retrying fixture ${fixture.id}, error:`, error);
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                    }
                }
            }
        }

        console.log(`✅ Completed syncing odds for ${this.sourceName}`);
    }

    private async processFixture(fixtureId: number, sourceFixtureId: string): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            this.cleanup();

            try {
                this.ws = new WebSocket(this.WS_URL);

                // Set timeout for initial connection and response
                this.timeout = setTimeout(() => {
                    if (!this.isProcessingSnapshot) {
                        this.cleanup();
                        reject(new Error("WebSocket operation timed out"));
                    }
                }, 30000); // 30 seconds total timeout

                this.ws.on("open", () => {
                    console.log(`🔗 WebSocket connected for fixture ${fixtureId}`);
                    this.ws?.send("40"); // WebSocket handshake
                    setTimeout(() => {
                        const payload = [
                            "subscribe",
                            {
                                messageType: "subscribe-match-odds",
                                data: {
                                    matchIds: [parseInt(sourceFixtureId)],
                                    isBaseOddsGroups: false,
                                },
                            },
                        ];
                        this.ws?.send(`42${JSON.stringify(payload)}`);
                    }, 300);
                });

                this.ws.on("message", async (data: WebSocket.Data) => {
                    const msg = data.toString();
                    if (!msg.startsWith("42")) return;

                    try {
                        const parsed = JSON.parse(msg.slice(2));
                        if (parsed?.[1]?.messageType === "match-odds-snapshot") {
                            this.isProcessingSnapshot = true;
                            if (this.timeout) {
                                clearTimeout(this.timeout);
                                this.timeout = null;
                            }

                            try {
                                await this.processOddsSnapshot(parsed[1].data, fixtureId, sourceFixtureId);
                                this.cleanup();
                                resolve();
                            } catch (error) {
                                this.cleanup();
                                reject(error);
                            }
                        }
                    } catch (err) {
                        this.cleanup();
                        reject(err);
                    } finally {
                        this.isProcessingSnapshot = false;
                    }
                });

                this.ws.on("error", (err) => {
                    if (!this.isProcessingSnapshot) {
                        this.cleanup();
                        reject(err);
                    }
                });

                this.ws.on("close", (code, reason) => {
                    if (!this.isProcessingSnapshot) {
                        this.cleanup();
                        reject(new Error(`WebSocket closed prematurely. Code: ${code}, Reason: ${reason}`));
                    }
                });
            } catch (err) {
                this.cleanup();
                reject(err);
            }
        });
    }

    private cleanup() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        if (this.ws) {
            this.ws.removeAllListeners();
            try {
                this.ws.terminate();
            } catch (e) {
                console.warn("Error while terminating WebSocket:", e);
            }
            this.ws = null;
        }
        this.isProcessingSnapshot = false;
    }

    private async processOddsSnapshot(data: any, fixtureId: number, sourceFixtureId: string) {
        try {
            const oddsGroups = data.oddsGroups ?? [];
            const filteredMarkets = oddsGroups.filter((group: any) => this.groupMapping[group.name]);

            for (const group of filteredMarkets) {
                const mappedGroupName = this.groupMapping[group.name];
                const dbGroup = this.dbGroups.find((g) => g.group_name === mappedGroupName);
                if (!dbGroup) continue;

                for (const odd of group.oddsList) {
                    const mappedOutcome = this.outcomeMapping[odd.outcome];
                    const handicap = group.name === "Total" ? odd?.vars?.v1 : null;

                    if (group.name === "Total" && handicap !== "2.5") continue;

                    const dbMarket = this.dbMarkets.find(
                        (m) =>
                            m.group_id === dbGroup.group_id &&
                            m.market_name.toLowerCase() === mappedOutcome?.toLowerCase()
                    );

                    if (!dbMarket) continue;

                    const coefficient = parseFloat(odd.cf);
                    if (!coefficient || coefficient <= 0) continue;

                    await OddsSnapshotService.saveOrUpdate({
                        group_id: dbGroup.group_id,
                        market_id: dbMarket.market_id,
                        fixture_id: fixtureId,
                        source_id: this.sourceId,
                        external_source_fixture_id: sourceFixtureId,
                        coefficient,
                    });

                    // await db("fixture_odds")
                    //     .insert({
                    //         group_id: dbGroup.group_id,
                    //         market_id: dbMarket.market_id,
                    //         coefficient,
                    //         fixture_id: fixtureId,
                    //         external_source_fixture_id: sourceFixtureId,
                    //         source_id: this.sourceId,
                    //     })
                    //     .onConflict([
                    //         "group_id",
                    //         "market_id",
                    //         "fixture_id",
                    //         "external_source_fixture_id",
                    //         "source_id",
                    //     ])
                    //     .merge({
                    //         coefficient: db.raw("EXCLUDED.coefficient"),
                    //         updated_at: db.fn.now(),
                    //     });

                    // console.log(
                    //     `✅ ${group.name} - ${mappedOutcome} (${coefficient}) saved for fixture ${fixtureId}`
                    // );
                }
            }
        } catch (error) {
            console.error("Error processing odds snapshot:", error);
            throw error;
        }
    }
}

export default Fetch1WinProOddsService;