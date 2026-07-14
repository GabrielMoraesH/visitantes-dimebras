import { Router } from "express";
import { auth, adminOnly } from "../middlewares/auth.js";
import {
  createTvContent,
  deleteTvContent,
  handleTvUploadErrors,
  listActiveTvContents,
  listPublicActiveTvContents,
  listTvContents,
  toggleTvContent,
  updateTvContent,
} from "../controllers/tvContent.controller.js";

const router = Router();

router.get("/public/active", listPublicActiveTvContents);
router.get("/", auth, adminOnly, listTvContents);
router.get("/active", auth, adminOnly, listActiveTvContents);
router.post("/", auth, adminOnly, handleTvUploadErrors, createTvContent);
router.put("/:id", auth, adminOnly, updateTvContent);
router.patch("/:id/toggle", auth, adminOnly, toggleTvContent);
router.delete("/:id", auth, adminOnly, deleteTvContent);

export default router;
