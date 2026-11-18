import { Router } from "express";
import { auth, authorizeRoles } from "../middlewares/auth.js";
import { listBranches } from "../controllers/branches.controller.js";
import { USER_ROLES } from "../constants/roles.js";

const router = Router();
router.use(auth);
router.get("/", authorizeRoles(USER_ROLES.ADMIN), listBranches);

export default router;
