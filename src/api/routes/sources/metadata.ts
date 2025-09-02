import { Router } from "express";
import {
    getAllSources,
    getAvailableCountries,
    getAvailableBookmakers,
    getAvailableTypes
} from "../../../config/sources";
import { CountryCode, SourceConfig } from "../../../syncTypes";

const router = Router();

// GET /api/sources
router.get("/", (req, res) => {
    const { type, country, bookmaker, enabled } = req.query;
    let sources = getAllSources();

    if (type) sources = sources.filter(s => s.type === type);
    if (country) sources = sources.filter(s => s.country === country);
    if (bookmaker) sources = sources.filter(s => s.bookmaker === bookmaker);
    if (enabled) sources = sources.filter(s => s.enabled === (enabled === 'true'));

    res.json({
        success: true,
        data: {
            sources,
            count: sources.length
        }
    });
});

// GET /api/sources/active
router.get("/active", (_, res) => {
    const activeSources = getAllSources().filter(s => s.enabled);
    res.json({
        success: true,
        data: {
            sources: activeSources,
            count: activeSources.length
        }
    });
});

// GET /api/sources/countries
router.get("/countries", (_, res) => {
    res.json({
        success: true,
        data: {
            countries: getAvailableCountries()
        }
    });
});

// GET /api/sources/bookmakers
router.get("/bookmakers", (req, res) => {
    const bookmakers = req.query.country
        ? getAvailableBookmakers(req.query.country as CountryCode)
        : getAvailableBookmakers();

    res.json({
        success: true,
        data: {
            bookmakers
        }
    });
});

// GET /api/sources/types
router.get("/types", (_, res) => {
    res.json({
        success: true,
        data: {
            types: getAvailableTypes()
        }
    });
});

export default router;