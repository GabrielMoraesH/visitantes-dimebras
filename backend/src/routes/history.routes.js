import { Router } from "express";
import { listHistory } from "../controllers/history.controller.js";
import { auth, authorizeRoles } from "../middlewares/auth.js";
import { USER_ROLES } from "../constants/roles.js";

const router = Router();

router.get("/", auth, authorizeRoles(USER_ROLES.ADMIN), listHistory);

export default router;
