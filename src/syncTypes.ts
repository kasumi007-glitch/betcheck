export type RunResult = {
    status: "fulfilled" | "rejected";
    label: string;
    duration?: string;
    timestamp?: string;
    reason?: any;
};

export type SyncType = "leagues" | "fixtures" | "odds";
export type CountryCode = "ci";
export type Bookmaker = string;

export type CountrySources = Record<Bookmaker, SourceConfig[]>;
export type AllSources = Record<CountryCode, CountrySources>;

export interface SourceConfig {
    id: string;
    label: string;
    service: () => Promise<any>;
    enabled: boolean;
    timeoutMs?: number;
    country: CountryCode;
    type: SyncType;
    bookmaker: Bookmaker;
}

export type CountryConfig = {
    name: string;
    code: CountryCode;
    bookmakers: Bookmaker[];
};

export interface SyncOptions {
    country?: CountryCode;
    bookmaker?: Bookmaker;
    type?: SyncType;
    ids?: string[];
}

export type BookmakerConfig = {
    [bookmaker: string]: SourceConfig[];
};