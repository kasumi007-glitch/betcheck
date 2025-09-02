import { CountryCode, SyncType, Bookmaker, SourceConfig } from "../syncTypes";

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface SyncRequestQuery {
    country?: CountryCode;
    bookmaker?: Bookmaker;
    type?: SyncType;
    ids?: string;
    enabled?: string; // "true" | "false"
}

// Helper types for specific responses
export type SourcesResponse = ApiResponse<{
    sources: SourceConfig[];
    count: number;
}>;

export type CountryListResponse = ApiResponse<{
    countries: CountryCode[];
}>;