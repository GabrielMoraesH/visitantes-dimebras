import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { listBranches } from "../controllers/branches.controller.js";

const router = Router();
router.use(auth);
router.get("/", listBranches);

export default router;