import { Router } from "express";
import sourcesRouter from "./sources";
import syncRouter from "./sync";
import statusRouter from "./status";

const router = Router();

router.use("/sources", sourcesRouter);
router.use("/sync", syncRouter);
router.use("/status", statusRouter);

export default router;