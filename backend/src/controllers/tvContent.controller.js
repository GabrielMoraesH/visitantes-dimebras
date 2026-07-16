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
      return cb(new Error("Campo de arquivo invalido. Use o campo file."), false);
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

function zodIssues(err) {
  return err?.issues?.map((i) => ({
    path: i.path?.join(".") || "",
    message: i.message,
  })) || [];
}

function sendError(res, statusCode, message, code) {
  return res.status(statusCode).json(toErrorPayload({ message, code, statusCode }));
}

export function handleTvUploadErrors(req, res, next) {
  tvUpload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendError(res, 413, "Arquivo excede o limite de 200MB.", "UPLOAD_FILE_TOO_LARGE");
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_PART_COUNT") {
        return sendError(res, 400, "Quantidade de arquivos excedida.", "UPLOAD_TOO_MANY_FILES");
      }
      return sendError(res, 400, "Upload invalido.", "UPLOAD_INVALID");
    }

    return sendError(res, err.statusCode || 400, err.message || "Upload invalido.", err.code);
  });
}

export async function listTvContents(req, res) {
  try {
    const items = await tvContentService.listTvContents();

    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function listActiveTvContents(req, res) {
  try {
    const items = await tvContentService.listActiveTvContents();

    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function listPublicActiveTvContents(req, res) {
  try {
    const result = await tvContentService.listPublicActiveTvContents({ query: req.query });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json(result.items);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Parametros invalidos", issues: zodIssues(err) });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function createTvContent(req, res) {
  try {
    const result = await tvContentService.createTvContent({
      actor: req.user,
      input: req.body,
      file: req.file,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.status(201).json(result.content);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados invalidos", issues: zodIssues(err) });
    }
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function updateTvContent(req, res) {
  try {
    const result = await tvContentService.updateTvContent({
      contentId: req.params,
      input: req.body,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json(result.content);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados invalidos", issues: zodIssues(err) });
    }
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function toggleTvContent(req, res) {
  try {
    const result = await tvContentService.toggleTvContent({ contentId: req.params });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json(result.content);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados invalidos", issues: zodIssues(err) });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function deleteTvContent(req, res) {
  try {
    const result = await tvContentService.deleteTvContent({ contentId: req.params });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json({ ok: true });
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados invalidos", issues: zodIssues(err) });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}
