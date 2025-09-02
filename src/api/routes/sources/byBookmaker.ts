import { Router } from "express";
import { getBookmakerConfig } from "../../../config/sources";
import { CountryCode } from "../../../syncTypes";

const router = Router();

// GET /api/sources/:country/:bookmaker
router.get("/:country/:bookmaker", (req, res) => {
    const config = getBookmakerConfig(req.params.country as CountryCode, req.params.bookmaker);
    if (!config) {
        res.status(404).json({
            success: false,
            error: "Bookmaker not found in specified country"
        });
    }
    res.json({ success: true, data: config });
});

export default router;