import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  getByCpf,
  createVisitor,
  updateVisitorFiles,
  getVisitorPhoto,
  getVisitorDocFront,
  getVisitorDocBack,
  updateVisitor,
  deleteIncompleteVisitorFromCurrentAttempt,
} from "../controllers/visitors.controller.js";
import { handleVisitorUploadErrors } from "../utils/upload.js";

const router = Router();

router.get("/by-cpf/:cpf", auth, getByCpf);
router.post("/", auth, createVisitor);

router.put("/:id", auth, updateVisitor);
router.delete("/:id/incomplete-created", auth, deleteIncompleteVisitorFromCurrentAttempt);

router.get("/:id/photo", auth, getVisitorPhoto);
router.get("/:id/doc-front", auth, getVisitorDocFront);
router.get("/:id/doc-back", auth, getVisitorDocBack);

router.put(
  "/:id/files",
  auth,
  handleVisitorUploadErrors,
  updateVisitorFiles
);

export default router;
