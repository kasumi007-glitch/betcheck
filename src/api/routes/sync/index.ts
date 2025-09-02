import { Router } from "express";
import mainRouter from "./main";
import singleRouter from "./single";
import countryRouter from "./country";

const router = Router();

router.use("/", mainRouter);
router.use("/single", singleRouter);
router.use("/country", countryRouter);

export default router;