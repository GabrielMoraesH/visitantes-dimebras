import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { tvTempUploadDir } from "../config/uploads.js";
import {
  TV_FILE_LIMIT_BYTES,
  TV_MEDIA_MIMES,
  validateDeclaredFile,
} from "../utils/fileSecurity.js";
import { toErrorPayload } from "../utils/errors.js";
import * as tvContentService from "../services/tvContent.service.js";
import { logInfo, logWarn } from "../utils/logger.js";

fs.mkdirSync(tvTempUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdir(tvTempUploadDir, { recursive: true }, (err) => cb(err, tvTempUploadDir));
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}.upload`);
  },
});

export const tvUpload = multer({
  storage,
  limits: {
    fileSize: TV_FILE_LIMIT_BYTES,
    files: 1,
    fields: 4,
    parts: 5,
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname !== "file") {
      return cb(new Error("Campo de arquivo inválido. Use o campo file."), false);
    }

    const declared = validateDeclaredFile(file, TV_MEDIA_MIMES);
    if (!declared.ok) {
      const err = new Error(declared.message);
      err.statusCode = declared.statusCode;
      return cb(err, false);
    }

    return cb(null, true);
  },
});

function sendError(res, statusCode, message, code) {
  return res.status(statusCode).json(toErrorPayload({ message, code, statusCode }));
}

function forwardError(err, next) {
  if (typeof next === "function") return next(err);
  throw err;
}

export function handleTvUploadErrors(req, res, next) {
  tvUpload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      logWarn("tv_content_upload_failed", {
        requestId: req.requestId,
        reason: err.code || "multer_error",
        userId: req.user?.id ?? null,
        branchId: req.user?.branchId ?? null,
      });
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendError(res, 413, "Arquivo excede o limite de 200MB.", "UPLOAD_FILE_TOO_LARGE");
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_PART_COUNT") {
        return sendError(res, 400, "Quantidade de arquivos excedida.", "UPLOAD_TOO_MANY_FILES");
      }
      return sendError(res, 400, "Upload inválido.", "UPLOAD_INVALID");
    }

    if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500) {
      logWarn("tv_content_upload_failed", {
        requestId: req.requestId,
        reason: err.code || "invalid_upload",
        userId: req.user?.id ?? null,
        branchId: req.user?.branchId ?? null,
      });
      return sendError(res, err.statusCode, err.message || "Upload inválido.", err.code);
    }

    logWarn("tv_content_upload_failed", {
      requestId: req.requestId,
      reason: "technical_error",
      userId: req.user?.id ?? null,
      branchId: req.user?.branchId ?? null,
    });
    return next(err);
  });
}

export async function listTvContents(req, res, next) {
  try {
    const items = await tvContentService.listTvContents();

    return res.json(items);
  } catch (err) {
    return forwardError(err, next);
  }
}

export async function listActiveTvContents(req, res, next) {
  try {
    const items = await tvContentService.listActiveTvContents();

    return res.json(items);
  } catch (err) {
    return forwardError(err, next);
  }
}

export async function listPublicActiveTvContents(req, res, next) {
  try {
    const result = await tvContentService.listPublicActiveTvContents({ query: req.query });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json(result.items);
  } catch (err) {
    return forwardError(err, next);
  }
}

export async function createTvContent(req, res, next) {
  try {
    const result = await tvContentService.createTvContent({
      actor: req.user,
      input: req.body,
      file: req.file,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    logInfo("tv_content_created", {
      requestId: req.requestId,
      tvContentId: result.content.id,
      userId: req.user?.id ?? null,
      branchId: req.user?.branchId ?? null,
    });

    return res.status(201).json(result.content);
  } catch (err) {
    logWarn("tv_content_upload_failed", {
      requestId: req.requestId,
      reason: "technical_error",
      userId: req.user?.id ?? null,
      branchId: req.user?.branchId ?? null,
    });
    return forwardError(err, next);
  }
}

export async function updateTvContent(req, res, next) {
  try {
    const result = await tvContentService.updateTvContent({
      contentId: req.params,
      input: req.body,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json(result.content);
  } catch (err) {
    return forwardError(err, next);
  }
}

export async function toggleTvContent(req, res, next) {
  try {
    const result = await tvContentService.toggleTvContent({ contentId: req.params });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json(result.content);
  } catch (err) {
    return forwardError(err, next);
  }
}

export async function deleteTvContent(req, res, next) {
  try {
    const result = await tvContentService.deleteTvContent({ contentId: req.params });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    logInfo("tv_content_deleted", {
      requestId: req.requestId,
      tvContentId: Number(req.params.id),
      userId: req.user?.id ?? null,
      branchId: req.user?.branchId ?? null,
    });

    return res.json({ ok: true });
  } catch (err) {
    return forwardError(err, next);
  }
}
