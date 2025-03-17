import {League} from "./League";

export interface Country {
    name: string;
    id: string;
    leagues: League[]
}
