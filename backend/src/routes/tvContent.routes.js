import { Router } from "express";
import { auth, authorizeRoles } from "../middlewares/auth.js";
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
import { USER_ROLES } from "../constants/roles.js";

const router = Router();

router.get("/public/active", listPublicActiveTvContents);
router.get("/", auth, authorizeRoles(USER_ROLES.ADMIN), listTvContents);
router.get("/active", auth, authorizeRoles(USER_ROLES.ADMIN), listActiveTvContents);
router.post("/", auth, authorizeRoles(USER_ROLES.ADMIN), handleTvUploadErrors, createTvContent);
router.put("/:id", auth, authorizeRoles(USER_ROLES.ADMIN), updateTvContent);
router.patch("/:id/toggle", auth, authorizeRoles(USER_ROLES.ADMIN), toggleTvContent);
router.delete("/:id", auth, authorizeRoles(USER_ROLES.ADMIN), deleteTvContent);

export default router;
