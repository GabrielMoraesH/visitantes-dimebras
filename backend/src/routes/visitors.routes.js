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
} from "../controllers/visitors.controller.js";
import { upload } from "../utils/upload.js";

const router = Router();

router.get("/by-cpf/:cpf", auth, getByCpf);
router.post("/", auth, createVisitor);

router.put("/:id", auth, updateVisitor);

router.get("/:id/photo", auth, getVisitorPhoto);
router.get("/:id/doc-front", auth, getVisitorDocFront);
router.get("/:id/doc-back", auth, getVisitorDocBack);

router.put(
  "/:id/files",
  auth,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documentFront", maxCount: 1 },
    { name: "documentBack", maxCount: 1 },
  ]),
  updateVisitorFiles
);

export default router;