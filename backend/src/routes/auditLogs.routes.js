import { Router } from "express";
import { listAuditLogs } from "../controllers/auditLogs.controller.js";
import { auth, authorizeRoles } from "../middlewares/auth.js";
import { USER_ROLES } from "../constants/roles.js";

const router = Router();

router.get("/", auth, authorizeRoles(USER_ROLES.ADMIN), listAuditLogs);

export default router;
