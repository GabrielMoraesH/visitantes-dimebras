import { Router } from "express";
import { login } from "../controllers/auth.controller.js";
import { loginRateLimit } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/login", loginRateLimit, login);

export default router;
