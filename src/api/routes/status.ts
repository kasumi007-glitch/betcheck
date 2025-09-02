import { Router } from "express";
import { syncService } from "../../services/syncService";
import { getAllSources } from "../../config/sources";
import { ApiResponse } from "../types";

const router = Router();

// GET /api/status
router.get("/", (_, res) => {
  const sources = getAllSources();
  res.json({
    success: true,
    data: {
      totalSources: sources.length,
      enabledSources: sources.filter(s => s.enabled).length,
      lastSync: syncService.getLastRun(),
      uptime: process.uptime()
    }
  });
});

export default router;