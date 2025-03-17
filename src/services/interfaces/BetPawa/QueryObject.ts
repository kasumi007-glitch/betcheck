export interface QueryObject {
    queries: {
        query: {
            eventType: string;
            categories: string[];
            zones: object;
            hasOdds: boolean;
        };
        view: {
            marketTypes: string[];
        };
        skip: number;
        take: number;
    }[];
}