import fs from "fs";
import path from "path";
import multer from "multer";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { tvPublicPrefix, tvUploadDir } from "../config/uploads.js";

const MAX_FILE_SIZE = 200 * 1024 * 1024;

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

fs.mkdirSync(tvUploadDir, { recursive: true });

function sanitizeBaseName(name = "midia") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .toLowerCase() || "midia";
}

function getTypeFromMime(mime) {
  if (IMAGE_MIMES.has(mime)) return "IMAGE";
  if (VIDEO_MIMES.has(mime)) return "VIDEO";
  return null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdir(tvUploadDir, { recursive: true }, (err) => cb(err, tvUploadDir));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeName = sanitizeBaseName(file.originalname);
    cb(null, `${Date.now()}-${safeName}${ext}`);
  },
});

export const tvUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.fieldname !== "file") {
      return cb(new Error("Campo de arquivo invalido. Use o campo file."), false);
    }

    if (!getTypeFromMime(file.mimetype)) {
      return cb(new Error("Arquivo deve ser JPG, PNG, WEBP, MP4 ou WEBM."), false);
    }

    return cb(null, true);
  },
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Titulo obrigatorio"),
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
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1, "Titulo nao pode ficar vazio").optional(),
    order: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
    branchIds: z.any().optional(),
  })
  .strict();

const publicTvContentSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

function zodIssues(err) {
  return err?.issues?.map((i) => ({
    path: i.path?.join(".") || "",
    message: i.message,
  })) || [];
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

function normalizeBoolean(value) {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
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
  const branchIds = values.map((value) => Number(value));

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

function removeUploadedFile(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  const relative = path.relative(tvUploadDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return;
  fs.unlink(resolved, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Erro ao remover arquivo TV:", err);
    }
  });
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
      const message = err.code === "LIMIT_FILE_SIZE"
        ? "Arquivo excede o limite de 200MB."
        : err.message;
      return res.status(400).json({ message });
    }

    return res.status(400).json({ message: err.message || "Upload invalido." });
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
  try {
    const data = createSchema.parse(req.body);
    const branchIds = await validateBranchIds(data.branchIds);

    if (!req.file) {
      return res.status(400).json({ message: "Arquivo obrigatorio." });
    }

    const type = getTypeFromMime(req.file.mimetype);
    if (!type) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ message: "Tipo de arquivo nao permitido." });
    }

    const created = await prisma.$transaction(async (tx) => {
      const content = await tx.tvContent.create({
        data: {
          title: data.title,
          type,
          fileUrl: `${tvPublicPrefix}/${req.file.filename}`,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
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
    if (req.file?.path) removeUploadedFile(req.file.path);
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
    const data = updateSchema.parse({
      ...req.body,
      isActive: normalizeBoolean(req.body?.isActive),
    });
    const hasBranchIds = Object.prototype.hasOwnProperty.call(data, "branchIds");

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "Nada para atualizar" });
    }

    const exists = await findAllowedContent(id);
    if (!exists) return res.status(404).json({ message: "Conteudo nao encontrado" });

    const updated = await prisma.$transaction(async (tx) => {
      const updateData = { ...data };
      delete updateData.branchIds;

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
    removeUploadedFile(filePathFromUrl(exists.fileUrl));

    return res.json({ ok: true });
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados invalidos", issues: zodIssues(err) });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}
