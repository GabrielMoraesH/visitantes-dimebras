import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  listEvents,
  listPublicTvNowEvents,
  createEvent,
  updateEvent,
  cancelEvent,
} from "../controllers/agenda.controller.js";

const router = Router();

router.get("/public/tv-now", listPublicTvNowEvents);

router.get("/", auth, listEvents);

router.post("/", auth, createEvent);

router.put("/:id", auth, updateEvent);

router.patch("/:id/cancel", auth, cancelEvent);

export default router;
