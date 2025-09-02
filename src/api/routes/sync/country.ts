import { Router } from "express";
import { syncService } from "../../../services/syncService";
import { CountryCode, SyncType } from "../../../syncTypes";

const router = Router();

// GET /api/sync/country/:countryCode
router.get("/:countryCode", async (req, res) => {
    try {
        const results = await syncService.syncCountry(
            req.params.countryCode as CountryCode,
            req.query.type as SyncType
        );
        res.json({ success: true, data: results });
    } catch (error: any) {
        res.status(404).json({ success: false, error: error.message });
    }
});

export default router;