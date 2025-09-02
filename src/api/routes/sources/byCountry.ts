import { Router } from "express";
import { getCountryConfig, getSourcesByCountry } from "../../../config/sources";
import { CountryCode } from "../../../syncTypes";

const router = Router();

// GET /api/sources/:country
router.get("/:country", (req, res) => {
    const config = getCountryConfig(req.params.country as CountryCode);
    if (!config) {
        res.status(404).json({ success: false, error: "Country not found" });
    }
    res.json({ success: true, data: config });
});

// GET /api/sources/:country/active
router.get("/:country/active", (req, res) => {
    const sources = getSourcesByCountry(req.params.country as CountryCode).filter(s => s.enabled);
    res.json({ success: true, data: sources });
});

export default router;