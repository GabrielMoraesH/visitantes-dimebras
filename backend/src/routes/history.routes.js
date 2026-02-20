import { Router } from "express";
import { listHistory } from "../controllers/history.controller.js";
import { auth, adminOnly } from "../middlewares/auth.js";

const router = Router();

router.get("/", auth, adminOnly, listHistory);

export default router;
