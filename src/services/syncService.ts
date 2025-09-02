import {
    getAllSources,
    getSourcesByCountry,
    getSourcesByBookmaker,
    getSourceById
} from "../config/sources";
import { SyncType } from "../syncTypes";
import { RunResult, SyncOptions, CountryCode } from "../syncTypes";

export class SyncService {
    private lastRun: RunResult[] = [];

    async runWithTimeout(label: string, fn: () => Promise<any>, timeoutMs = 30000): Promise<RunResult> {
        const start = Date.now();
        try {
            await Promise.race([
                fn(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
                )
            ]);
            return {
                status: "fulfilled",
                label,
                duration: `${(Date.now() - start) / 1000}s`,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: "rejected",
                label,
                reason: error,
                duration: `${(Date.now() - start) / 1000}s`,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sync(options: SyncOptions): Promise<RunResult[]> {
        let sources = getAllSources().filter(s => s.enabled);

        if (options.country) sources = getSourcesByCountry(options.country);
        if (options.bookmaker) sources = getSourcesByBookmaker(options.bookmaker);
        if (options.type) sources = sources.filter(s => s.type === options.type);
        if (options.ids) sources = sources.filter(s => options.ids?.includes(s.id));

        const results = await Promise.all(
            sources.map(source => this.runWithTimeout(source.label, source.service, source.timeoutMs))
        );

        this.lastRun = results;
        return results;
    }

    async syncSingle(sourceId: string): Promise<RunResult> {
        const source = getSourceById(sourceId);
        if (!source || !source.enabled) {
            throw new Error(`Source ${sourceId} not found or disabled`);
        }

        const result = await this.runWithTimeout(source.label, source.service, source.timeoutMs);
        this.lastRun = [result];
        return result;
    }

    async syncCountry(country: CountryCode, type?: SyncType): Promise<RunResult[]> {
        let sources = getSourcesByCountry(country).filter(s => s.enabled);
        if (type) sources = sources.filter(s => s.type === type);

        if (sources.length === 0) {
            throw new Error(`No enabled sources found for country ${country}`);
        }

        const results = await Promise.all(
            sources.map(source => this.runWithTimeout(source.label, source.service, source.timeoutMs))
        );

        this.lastRun = results;
        return results;
    }

    getLastRun(): RunResult[] {
        return this.lastRun;
    }
}

export const syncService = new SyncService();