import { Router } from "express";
import { syncService } from "../../../services/syncService";

const router = Router();

// GET /api/sync/single/:sourceId
router.get("/:sourceId", async (req, res) => {
    try {
        const result = await syncService.syncSingle(req.params.sourceId);
        res.json({ success: true, data: result });
    } catch (error: any) {
        res.status(404).json({ success: false, error: error.message });
    }
});

export default router;