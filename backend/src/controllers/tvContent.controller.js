import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { tvPublicPrefix, tvTempUploadDir, tvUploadDir } from "../config/uploads.js";
import {
  assertPathInside,
  makeSafeStoredFileName,
  TV_FILE_LIMIT_BYTES,
  TV_MEDIA_MIMES,
  validateDeclaredFile,
  validateMagicBytes,
} from "../utils/fileSecurity.js";
import { toErrorPayload } from "../utils/errors.js";
import {
  idParamSchema,
  LIMITS,
  positiveIntQuery,
  strictBoolean,
  trimmedString,
} from "../utils/validation.js";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

fs.mkdirSync(tvUploadDir, { recursive: true });
fs.mkdirSync(tvTempUploadDir, { recursive: true });

function getTypeFromMime(mime) {
  if (IMAGE_MIMES.has(mime)) return "IMAGE";
  if (VIDEO_MIMES.has(mime)) return "VIDEO";
  return null;
}

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

const createSchema = z.object({
  title: trimmedString(LIMITS.tvTitle, "Titulo obrigatorio"),
  order: z.coerce.number().int().optional().default(0),
  isActive: z
    .preprocess((value) => {
      if (value === "true" || value === true) return true;
      if (value === "false" || value === false) return false;
      if (value === "" || value === undefined) return undefined;
      return value;
    }, z.boolean().optional())
    .default(true),
  branchIds: z.any(),
}).strict();

const updateSchema = z
  .object({
    title: trimmedString(LIMITS.tvTitle, "Titulo nao pode ficar vazio").optional(),
    order: z.coerce.number().int().optional(),
    isActive: strictBoolean.optional(),
    branchIds: z.any().optional(),
  })
  .strict();

const publicTvContentSchema = z.object({
  branchId: positiveIntQuery("branchId"),
}).strict();

function zodIssues(err) {
  return err?.issues?.map((i) => ({
    path: i.path?.join(".") || "",
    message: i.message,
  })) || [];
}

function sendError(res, statusCode, message, code) {
  return res.status(statusCode).json(toErrorPayload({ message, code, statusCode }));
}

function serialize(item) {
  if (!item) return item;
  const { branches, ...rest } = item;
  return {
    ...rest,
    branches: Array.isArray(branches)
      ? branches.map((link) => link.branch).filter(Boolean)
      : [],
  };
}

async function findAllowedContent(id) {
  return prisma.tvContent.findUnique({
    where: { id },
    include: {
      branches: {
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { branchId: "asc" },
      },
    },
  });
}

function parseBranchIds(rawValue) {
  let raw = rawValue;

  if (typeof raw === "undefined") {
    return [];
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      raw = JSON.parse(trimmed);
    } catch {
      raw = trimmed;
    }
  }

  const values = Array.isArray(raw) ? raw : [raw];
  const branchIds = values.map((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
    return NaN;
  });

  if (branchIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    const error = new Error("Filiais invalidas.");
    error.statusCode = 400;
    throw error;
  }

  return [...new Set(branchIds)];
}

async function validateBranchIds(rawValue, tx = prisma) {
  const branchIds = parseBranchIds(rawValue);

  if (branchIds.length === 0) {
    const error = new Error("Selecione pelo menos uma filial.");
    error.statusCode = 400;
    throw error;
  }

  const branches = await tx.branch.findMany({
    where: { id: { in: branchIds } },
    select: { id: true },
  });

  if (branches.length !== branchIds.length) {
    const error = new Error("Uma ou mais filiais nao existem.");
    error.statusCode = 400;
    throw error;
  }

  return branchIds;
}

async function readFileHead(filePath, bytes = 4096) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function removeFileInside(rootDir, filePath) {
  if (!filePath) return;
  const resolved = assertPathInside(rootDir, filePath);
  if (!resolved) return;

  try {
    await fs.promises.unlink(resolved);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("tv-file-remove-error", { code: err.code });
    }
  }
}

async function removeTempFile(filePath) {
  await removeFileInside(tvTempUploadDir, filePath);
}

async function promoteTvUpload(file) {
  const tempPath = assertPathInside(tvTempUploadDir, file?.path);
  if (!tempPath) {
    const error = new Error("Upload invalido.");
    error.statusCode = 400;
    throw error;
  }

  const head = await readFileHead(tempPath);
  const validation = validateMagicBytes({ ...file, buffer: head }, TV_MEDIA_MIMES);
  if (!validation.ok) {
    await removeTempFile(tempPath);
    const error = new Error(validation.message);
    error.statusCode = validation.statusCode;
    throw error;
  }

  const filename = makeSafeStoredFileName(validation.detected.mime);
  const finalPath = assertPathInside(tvUploadDir, path.join(tvUploadDir, filename));
  if (!filename || !finalPath) {
    await removeTempFile(tempPath);
    const error = new Error("Upload invalido.");
    error.statusCode = 400;
    throw error;
  }

  await fs.promises.rename(tempPath, finalPath);

  return {
    path: finalPath,
    filename,
    mime: validation.detected.mime,
    type: getTypeFromMime(validation.detected.mime),
    size: file.size,
  };
}

function filePathFromUrl(fileUrl) {
  const prefix = `${tvPublicPrefix}/`;
  const normalizedUrl = String(fileUrl || "");

  if (!normalizedUrl.startsWith(prefix)) return null;

  const fileName = path.basename(normalizedUrl);
  if (!fileName || fileName !== normalizedUrl.slice(prefix.length)) return null;

  return path.join(tvUploadDir, fileName);
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
    const items = await prisma.tvContent.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: {
        branches: {
          include: { branch: { select: { id: true, name: true } } },
          orderBy: { branchId: "asc" },
        },
      },
    });

    return res.json(items.map(serialize));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function listActiveTvContents(req, res) {
  try {
    const items = await prisma.tvContent.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        branches: {
          include: { branch: { select: { id: true, name: true } } },
          orderBy: { branchId: "asc" },
        },
      },
    });

    return res.json(items.map(serialize));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function listPublicActiveTvContents(req, res) {
  try {
    if (!req.query.branchId) {
      return res.status(400).json({
        message: "Filial obrigatória para exibição da TV.",
      });
    }

    const { branchId } = publicTvContentSchema.parse(req.query);
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });

    if (!branch) {
      return res.status(404).json({
        message: "Filial não encontrada.",
      });
    }

    const items = await prisma.tvContent.findMany({
      where: {
        isActive: true,
        branches: {
          some: { branchId },
        },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        type: true,
        fileUrl: true,
        order: true,
      },
    });

    return res.json(items);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Parametros invalidos", issues: zodIssues(err) });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function createTvContent(req, res) {
  let promotedFile = null;

  try {
    const data = createSchema.parse(req.body);
    const branchIds = await validateBranchIds(data.branchIds);

    if (!req.file) {
      return res.status(400).json({ message: "Arquivo obrigatorio." });
    }

    promotedFile = await promoteTvUpload(req.file);

    const created = await prisma.$transaction(async (tx) => {
      const content = await tx.tvContent.create({
        data: {
          title: data.title,
          type: promotedFile.type,
          fileUrl: `${tvPublicPrefix}/${promotedFile.filename}`,
          fileName: req.file.originalname,
          mimeType: promotedFile.mime,
          fileSize: promotedFile.size,
          order: data.order,
          isActive: data.isActive,
          createdById: req.user.id,
        },
      });

      await tx.tvContentBranch.createMany({
        data: branchIds.map((branchId) => ({
          tvContentId: content.id,
          branchId,
        })),
      });

      return tx.tvContent.findUnique({
        where: { id: content.id },
        include: {
          branches: {
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { branchId: "asc" },
          },
        },
      });
    });

    return res.status(201).json(serialize(created));
  } catch (err) {
    if (promotedFile?.path) {
      await removeFileInside(tvUploadDir, promotedFile.path);
    } else if (req.file?.path) {
      await removeTempFile(req.file.path);
    }
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
    const { id } = idParamSchema.parse(req.params);
    const data = updateSchema.parse(req.body);
    const hasBranchIds = Object.prototype.hasOwnProperty.call(data, "branchIds");

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "Nada para atualizar" });
    }

    const exists = await findAllowedContent(id);
    if (!exists) return res.status(404).json({ message: "Conteudo nao encontrado" });

    const updated = await prisma.$transaction(async (tx) => {
      const updateData = {};
      if (typeof data.title !== "undefined") updateData.title = data.title;
      if (typeof data.order !== "undefined") updateData.order = data.order;
      if (typeof data.isActive !== "undefined") updateData.isActive = data.isActive;

      if (hasBranchIds) {
        const branchIds = await validateBranchIds(data.branchIds, tx);
        await tx.tvContentBranch.deleteMany({ where: { tvContentId: id } });
        await tx.tvContentBranch.createMany({
          data: branchIds.map((branchId) => ({ tvContentId: id, branchId })),
        });
      }

      if (Object.keys(updateData).length > 0) {
        await tx.tvContent.update({
          where: { id },
          data: updateData,
        });
      }

      return tx.tvContent.findUnique({
        where: { id },
        include: {
          branches: {
            include: { branch: { select: { id: true, name: true } } },
            orderBy: { branchId: "asc" },
          },
        },
      });
    });

    return res.json(serialize(updated));
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
    const { id } = idParamSchema.parse(req.params);
    const exists = await findAllowedContent(id);
    if (!exists) return res.status(404).json({ message: "Conteudo nao encontrado" });

    const updated = await prisma.tvContent.update({
      where: { id },
      data: { isActive: !exists.isActive },
    });

    return res.json(serialize(updated));
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
    const { id } = idParamSchema.parse(req.params);
    const exists = await findAllowedContent(id);
    if (!exists) return res.status(404).json({ message: "Conteudo nao encontrado" });

    await prisma.tvContent.delete({ where: { id } });
    await removeFileInside(tvUploadDir, filePathFromUrl(exists.fileUrl));

    return res.json({ ok: true });
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados invalidos", issues: zodIssues(err) });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}
