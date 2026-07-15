import { Router } from "express";
import { auth, authorizeRoles } from "../middlewares/auth.js";
import { createUser, listUsers, updateUser, disableUser, enableUser } from "../controllers/users.controller.js";
import { USER_ROLES } from "../constants/roles.js";

const router = Router();

router.get("/", auth, authorizeRoles(USER_ROLES.ADMIN), listUsers);
router.post("/", auth, authorizeRoles(USER_ROLES.ADMIN), createUser);
router.put("/:id", auth, authorizeRoles(USER_ROLES.ADMIN), updateUser);
router.patch("/:id/disable", auth, authorizeRoles(USER_ROLES.ADMIN), disableUser);
router.patch("/:id/enable", auth, authorizeRoles(USER_ROLES.ADMIN), enableUser);

export default router;
