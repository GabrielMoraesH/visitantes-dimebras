import { Router } from "express";
import { health } from "../controllers/health.controller.js";

const router = Router();

router.get("/", health);
router.get("/ready", health);

export default router;
