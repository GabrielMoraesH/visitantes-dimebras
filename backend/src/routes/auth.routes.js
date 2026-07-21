import { Router } from "express";
import { login, me } from "../controllers/auth.controller.js";
import { auth } from "../middlewares/auth.js";
import { loginRateLimit } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/login", loginRateLimit, login);
router.get("/me", auth, me);

export default router;
