import { Router } from "express";
import metadataRouter from "./metadata";
import byCountryRouter from "./byCountry";
import byBookmakerRouter from "./byBookmaker";

const router = Router();

router.use("/", metadataRouter);
router.use("/", byCountryRouter);
router.use("/", byBookmakerRouter);

export default router;