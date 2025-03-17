import {EventResponse} from "./EventResponse";

export interface ApiResponse {
    request: any;
    responses: EventResponse[];
}