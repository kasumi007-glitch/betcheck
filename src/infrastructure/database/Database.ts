import knex from "knex";
import { config } from "../../config/db.config";

export const db = knex(config);
