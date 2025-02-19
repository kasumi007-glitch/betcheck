import express from "express";
import OddsController from "../controllers/OddsController";

const router = express.Router();

router.get("/api/odds/:fixtureId", OddsController.getOddsByFixture);

export default router;
