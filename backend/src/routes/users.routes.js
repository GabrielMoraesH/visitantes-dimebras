import { Router } from "express";
import { auth, adminOnly } from "../middlewares/auth.js";
import { createUser, listUsers, updateUser, disableUser, enableUser } from "../controllers/users.controller.js";

const router = Router();

router.get("/", auth, adminOnly, listUsers);
router.post("/", auth, adminOnly, createUser);
router.put("/:id", auth, adminOnly, updateUser);
router.patch("/:id/disable", auth, adminOnly, disableUser);
router.patch("/:id/enable", auth, adminOnly, enableUser);

export default router;