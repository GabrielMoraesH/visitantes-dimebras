import { Router } from "express";
import { auth, adminOnly } from "../middlewares/auth.js";
import { createUser, listUsers, deleteUser, updateUserPassword, updateUser } from "../controllers/users.controller.js";

const router = Router();

router.get("/", auth, adminOnly, listUsers);
router.post("/", auth, adminOnly, createUser);
router.delete("/:id", auth, adminOnly, deleteUser);
router.put("/:id", auth, adminOnly, updateUser);

export default router;
