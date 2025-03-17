import Market from "../../../models/Market";

export interface EventResponse {
    id: string;
    participants: any[];
    startTime: string;
    markets: Market[];
    competition: any;
}