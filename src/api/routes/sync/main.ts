import { Router } from "express";
import { syncService } from "../../../services/syncService";
import { SyncRequestQuery } from "../../types";
import { ApiResponse } from "../../types";
import { Bookmaker, CountryCode, SyncType } from "../../../syncTypes";

const router = Router();

// GET /api/sync
router.get("/", async (req, res) => {
    try {
        const results = await syncService.sync({
            country: req.query.country as CountryCode,
            bookmaker: req.query.bookmaker as Bookmaker,
            type: req.query.type as SyncType,
            ids: typeof req.query.ids === "string"
                ? req.query.ids.split(',')
                : Array.isArray(req.query.ids)
                    ? req.query.ids.flatMap(id => typeof id === "string" ? id.split(',') : [])
                    : undefined
        });
        res.json({ success: true, data: results });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/sync/last
router.get("/last", (_, res) => {
    res.json({ success: true, data: syncService.getLastRun() });
});

export default router;