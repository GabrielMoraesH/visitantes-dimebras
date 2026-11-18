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
router.get("/", auth, authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.RECEPCAO_TV), listTvContents);
router.get("/active", auth, authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.RECEPCAO_TV), listActiveTvContents);
router.post("/", auth, authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.RECEPCAO_TV), handleTvUploadErrors, createTvContent);
router.put("/:id", auth, authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.RECEPCAO_TV), updateTvContent);
router.patch("/:id/toggle", auth, authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.RECEPCAO_TV), toggleTvContent);
router.delete("/:id", auth, authorizeRoles(USER_ROLES.ADMIN, USER_ROLES.RECEPCAO_TV), deleteTvContent);

export default router;
