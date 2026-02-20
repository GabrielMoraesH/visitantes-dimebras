import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { checkin, label, checkout, openByCpf } from "../controllers/visits.controller.js";


const router = Router();

router.post("/checkin", auth, checkin);
router.get("/open-by-cpf/:cpf", auth, openByCpf);
router.get("/:id/label", label);
router.post("/checkout", auth, checkout);


export default router;