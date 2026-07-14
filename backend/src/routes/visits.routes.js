import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  checkin,
  label,
  labelToken,
  checkout,
  openByCpf,
  statsByCpf,
  recentByCpf,
  getVisitById,
  getOpenVisitsMyBranch,
} from "../controllers/visits.controller.js";

const router = Router();

router.post("/checkin", auth, checkin);

router.get("/open-by-cpf/:cpf", auth, openByCpf);

router.get("/open", auth, getOpenVisitsMyBranch);

router.get("/stats-by-cpf/:cpf", auth, statsByCpf);
router.get("/recent-by-cpf/:cpf", auth, recentByCpf);

router.post("/:id/label-token", auth, labelToken);
router.get("/:id/label", label);
router.get("/:id", auth, getVisitById);

router.post("/checkout", auth, checkout);

export default router;
