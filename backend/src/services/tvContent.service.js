import fs from "fs";
import path from "path";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { tvPublicPrefix, tvTempUploadDir, tvUploadDir } from "../config/uploads.js";
import {
  assertPathInside,
  makeSafeStoredFileName,
  TV_MEDIA_MIMES,
  validateMagicBytes,
} from "../utils/fileSecurity.js";
import {
  idParamSchema,
  LIMITS,
  positiveIntQuery,
  strictBoolean,
  trimmedString,
} from "../utils/validation.js";
import { logWarn } from "../utils/logger.js";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

const createSchema = z.object({
  title: trimmedString(LIMITS.tvTitle, "Título obrigatorio"),
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
    title: trimmedString(LIMITS.tvTitle, "Título não pode ficar vazio").optional(),
    order: z.coerce.number().int().optional(),
    isActive: strictBoolean.optional(),
    branchIds: z.any().optional(),
  })
  .strict();

const publicTvContentSchema = z.object({
  branchId: positiveIntQuery("branchId"),
}).strict();

function getTypeFromMime(mime) {
  if (IMAGE_MIMES.has(mime)) return "IMAGE";
  if (VIDEO_MIMES.has(mime)) return "VIDEO";
  return null;
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

function parseContentId(contentId) {
  if (contentId && typeof contentId === "object") return idParamSchema.parse(contentId).id;
  return idParamSchema.parse({ id: String(contentId) }).id;
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
    const error = new Error("Filiais inválidas.");
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
    const error = new Error("Uma ou mais filiais não existem.");
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
      logWarn("tv_file_remove_failed", { code: err.code });
    }
  }
}

async function removeTempFile(filePath) {
  await removeFileInside(tvTempUploadDir, filePath);
}

async function promoteTvUpload(file) {
  const tempPath = assertPathInside(tvTempUploadDir, file?.path);
  if (!tempPath) {
    const error = new Error("Upload inválido.");
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
    const error = new Error("Upload inválido.");
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

export async function listTvContents() {
  const items = await prisma.tvContent.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: {
      branches: {
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { branchId: "asc" },
      },
    },
  });

  return items.map(serialize);
}

export async function listActiveTvContents() {
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

  return items.map(serialize);
}

export async function listPublicActiveTvContents({ query }) {
  if (!query?.branchId) {
    return {
      ok: false,
      status: 400,
      message: "Filial obrigatória para exibição da TV.",
    };
  }

  const { branchId } = publicTvContentSchema.parse(query);
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });

  if (!branch) {
    return { ok: false, status: 404, message: "Filial não encontrada." };
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

  return { ok: true, items };
}

export async function createTvContent({ actor, input, file }) {
  let promotedFile = null;

  try {
    const data = createSchema.parse(input);
    const branchIds = await validateBranchIds(data.branchIds);

    if (!file) {
      return { ok: false, status: 400, message: "Arquivo obrigatorio." };
    }

    promotedFile = await promoteTvUpload(file);

    const created = await prisma.$transaction(async (tx) => {
      const content = await tx.tvContent.create({
        data: {
          title: data.title,
          type: promotedFile.type,
          fileUrl: `${tvPublicPrefix}/${promotedFile.filename}`,
          fileName: file.originalname,
          mimeType: promotedFile.mime,
          fileSize: promotedFile.size,
          order: data.order,
          isActive: data.isActive,
          createdById: actor.id,
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

    return { ok: true, content: serialize(created) };
  } catch (err) {
    if (promotedFile?.path) {
      await removeFileInside(tvUploadDir, promotedFile.path);
    } else if (file?.path) {
      await removeTempFile(file.path);
    }
    throw err;
  }
}

export async function updateTvContent({ contentId, input }) {
  const id = parseContentId(contentId);
  const data = updateSchema.parse(input);
  const hasBranchIds = Object.prototype.hasOwnProperty.call(data, "branchIds");

  if (Object.keys(data).length === 0) {
    return { ok: false, status: 400, message: "Nada para atualizar" };
  }

  const exists = await findAllowedContent(id);
  if (!exists) return { ok: false, status: 404, message: "Conteúdo não encontrado" };

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

  return { ok: true, content: serialize(updated) };
}

export async function toggleTvContent({ contentId }) {
  const id = parseContentId(contentId);
  const exists = await findAllowedContent(id);
  if (!exists) return { ok: false, status: 404, message: "Conteúdo não encontrado" };

  const updated = await prisma.tvContent.update({
    where: { id },
    data: { isActive: !exists.isActive },
  });

  return { ok: true, content: serialize(updated) };
}

export async function deleteTvContent({ contentId }) {
  const id = parseContentId(contentId);
  const exists = await findAllowedContent(id);
  if (!exists) return { ok: false, status: 404, message: "Conteúdo não encontrado" };

  await prisma.tvContent.delete({ where: { id } });
  await removeFileInside(tvUploadDir, filePathFromUrl(exists.fileUrl));

  return { ok: true };
}
