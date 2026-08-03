import { z } from "zod";
import prisma from "../lib/prisma.js";
import { parseVisitorId, userCanAccessVisitor } from "../utils/visitorAccess.js";
import { validateMagicBytes, VISITOR_IMAGE_MIMES } from "../utils/fileSecurity.js";
import {
  cpfSchema,
  LIMITS,
  optionalTrimmedString,
  phoneSchema,
  trimmedString,
} from "../utils/validation.js";

const createVisitorSchema = z.object({
  name: trimmedString(LIMITS.name, "Nome inválido").min(2, "Nome inválido"),
  cpf: cpfSchema,
  phone: phoneSchema,
  company: optionalTrimmedString(LIMITS.company),
}).strict();

const createVisitorWithFilesSchema = z.object({
  name: trimmedString(LIMITS.name, "Nome inválido").min(2, "Nome inválido"),
  cpf: cpfSchema,
  phone: z.string().pipe(phoneSchema),
  company: trimmedString(LIMITS.company, "Empresa inválida"),
}).strict();

const updateVisitorSchema = z.object({
  phone: phoneSchema.optional(),
  company: optionalTrimmedString(LIMITS.company).optional(),
}).strict();

const visitorFileFields = [
  ["photo", "photoBytes", "photoMime", "photoUpdatedAt"],
  ["documentFront", "documentFrontBytes", "documentFrontMime", "documentFrontUpdatedAt"],
  ["documentBack", "documentBackBytes", "documentBackMime", "documentBackUpdatedAt"],
];

function validateVisitorFile(file) {
  if (!file) return null;
  return validateMagicBytes(file, VISITOR_IMAGE_MIMES);
}

function buildVisitorFileUpdate(files) {
  const data = {};

  for (const [fileKey, bytesKey, mimeKey, updatedAtKey] of visitorFileFields) {
    const file = files[fileKey];
    if (!file) continue;

    const validation = validateVisitorFile(file);
    if (!validation.ok) {
      return { ok: false, validation };
    }

    data[bytesKey] = file.buffer;
    data[mimeKey] = validation.detected.mime;
    data[updatedAtKey] = new Date();
  }

  return { ok: true, data };
}

function buildRequiredVisitorFileCreate(files, now) {
  const data = {};

  for (const [fileKey, bytesKey, mimeKey, updatedAtKey] of visitorFileFields) {
    const validation = validateVisitorFile(files[fileKey]);
    if (!validation?.ok) {
      return { ok: false, validation };
    }

    data[bytesKey] = files[fileKey].buffer;
    data[mimeKey] = validation.detected.mime;
    data[updatedAtKey] = now;
  }

  return { ok: true, data };
}

function hasStoredVisitorFile(visitor, fileKey) {
  const field = visitorFileFields.find(([key]) => key === fileKey);
  if (!field) return false;

  const [, bytesKey, mimeKey] = field;
  return Boolean(visitor?.[bytesKey] && visitor?.[mimeKey]);
}

function validateVisitorFileCompleteness({ visitor, files }) {
  const requiredFields = visitorFileFields.map(([fileKey]) => fileKey);
  const missingUploadFields = requiredFields.filter((field) => !files[field]);
  const allFieldsUploaded = missingUploadFields.length === 0;
  const storedFields = requiredFields.filter((field) => hasStoredVisitorFile(visitor, field));
  const hasOnlyStoredPhoto =
    storedFields.length === 1 && storedFields[0] === "photo";
  const documentFieldsUploaded =
    Boolean(files.documentFront) && Boolean(files.documentBack) && !files.photo;

  if (storedFields.length === requiredFields.length) {
    return { ok: true };
  }

  if (allFieldsUploaded) {
    return { ok: true };
  }

  if (hasOnlyStoredPhoto && documentFieldsUploaded) {
    return { ok: true };
  }

  if (storedFields.length === 0) {
    return {
      ok: false,
      validation: {
        statusCode: 400,
        message: `Faltam arquivos obrigatórios: ${missingUploadFields.join(", ")}. Envie photo, documentFront e documentBack na mesma requisição.`,
      },
    };
  }

  return {
    ok: false,
    validation: {
      statusCode: 400,
      message:
        "Cadastro do visitante está inconsistente. Envie photo, documentFront e documentBack na mesma requisição para regularizar.",
    },
  };
}

export async function ensureFileAccess({ user, id }) {
  const visitorId = parseVisitorId(id);
  if (!visitorId) return { ok: false, reason: "invalid-id" };

  const canAccess = await userCanAccessVisitor(user, visitorId);
  if (!canAccess) return { ok: false, reason: "not-found" };

  return { ok: true, id: visitorId };
}

export async function findByCpf({ user, cpf }) {
  const parsedCpf = cpfSchema.parse(cpf);

  const visitor = await prisma.visitor.findUnique({
    where: { cpf: parsedCpf },
    select: {
      id: true,
      name: true,
      cpf: true,
      phone: true,
      company: true,

      photoUpdatedAt: true,
      documentFrontUpdatedAt: true,
      documentBackUpdatedAt: true,

      photoMime: true,
      documentFrontMime: true,
      documentBackMime: true,

      createdAt: true,
      updatedAt: true,
    },
  });

  if (!visitor) return { found: false };

  const canAccess = await userCanAccessVisitor(user, visitor.id);
  if (!canAccess) return { found: false, inaccessible: true };

  return { found: true, visitor };
}

export async function create({ user, body }) {
  const data = createVisitorSchema.parse(body);

  return prisma.visitor.create({
    data: {
      name: data.name,
      cpf: data.cpf,
      phone: data.phone,
      company: data.company ?? null,
      createdById: user.id,
      createdInBranchId: user.branchId,
    },
    select: {
      id: true,
      name: true,
      cpf: true,
      phone: true,
      company: true,
      createdAt: true,
    },
  });
}

export async function createWithFiles({ user, body, files }) {
  const data = createVisitorWithFilesSchema.parse(body);
  const now = new Date();
  const fileData = buildRequiredVisitorFileCreate(files, now);
  if (!fileData.ok) return fileData;

  const visitor = await prisma.$transaction((tx) =>
    tx.visitor.create({
      data: {
        name: data.name,
        cpf: data.cpf,
        phone: data.phone,
        company: data.company,
        createdById: user.id,
        createdInBranchId: user.branchId,
        ...fileData.data,
      },
      select: {
        id: true,
        name: true,
        cpf: true,
        phone: true,
        company: true,
        photoUpdatedAt: true,
        documentFrontUpdatedAt: true,
        documentBackUpdatedAt: true,
        createdAt: true,
      },
    })
  );

  return { ok: true, visitor };
}

export async function deleteIncompleteFromCurrentAttempt({ user, id }) {
  const visitorId = parseVisitorId(id);
  if (!visitorId) return { deleted: false, invalidId: true };

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const deleted = await prisma.visitor.deleteMany({
    where: {
      id: visitorId,
      createdById: user.id,
      createdInBranchId: user.branchId,
      createdAt: { gte: cutoff },
      photoBytes: null,
      documentFrontBytes: null,
      documentBackBytes: null,
      visits: { none: {} },
    },
  });

  return { deleted: deleted.count === 1 };
}

export async function update({ user, id, body }) {
  const visitorId = parseVisitorId(id);
  if (!visitorId) return { ok: false, reason: "invalid-id" };

  const canAccess = await userCanAccessVisitor(user, visitorId);
  if (!canAccess) return { ok: false, reason: "not-found" };

  const parsedBody = updateVisitorSchema.parse(body);
  const data = {};

  if ("phone" in parsedBody) {
    data.phone = parsedBody.phone ?? null;
  }

  if ("company" in parsedBody) {
    data.company = parsedBody.company ?? null;
  }

  const visitor = await prisma.visitor.update({
    where: { id: visitorId },
    data,
    select: {
      id: true,
      name: true,
      cpf: true,
      phone: true,
      company: true,
      updatedAt: true,
    },
  });

  return { ok: true, visitor };
}

export async function updateFiles({ user, id, files }) {
  const access = await ensureFileAccess({ user, id });
  if (!access.ok) return access;

  const currentVisitorFiles = await prisma.visitor.findUnique({
    where: { id: access.id },
    select: {
      photoBytes: true,
      photoMime: true,
      documentFrontBytes: true,
      documentFrontMime: true,
      documentBackBytes: true,
      documentBackMime: true,
    },
  });
  if (!currentVisitorFiles) return { ok: false, reason: "not-found" };

  const completeness = validateVisitorFileCompleteness({
    visitor: currentVisitorFiles,
    files,
  });
  if (!completeness.ok) return completeness;

  const dataResult = buildVisitorFileUpdate(files);
  if (!dataResult.ok) return dataResult;

  const visitor = await prisma.visitor.update({
    where: { id: access.id },
    data: dataResult.data,
    select: {
      id: true,
      cpf: true,
      photoUpdatedAt: true,
      documentFrontUpdatedAt: true,
      documentBackUpdatedAt: true,
    },
  });

  return { ok: true, visitor };
}

export async function getPhoto({ user, id }) {
  const access = await ensureFileAccess({ user, id });
  if (!access.ok) return access;

  const visitor = await prisma.visitor.findUnique({
    where: { id: access.id },
    select: { photoBytes: true, photoMime: true, photoUpdatedAt: true },
  });

  return { ok: true, visitor };
}

export async function getDocumentFront({ user, id }) {
  const access = await ensureFileAccess({ user, id });
  if (!access.ok) return access;

  const visitor = await prisma.visitor.findUnique({
    where: { id: access.id },
    select: { documentFrontBytes: true, documentFrontMime: true, documentFrontUpdatedAt: true },
  });

  return { ok: true, visitor };
}

export async function getDocumentBack({ user, id }) {
  const access = await ensureFileAccess({ user, id });
  if (!access.ok) return access;

  const visitor = await prisma.visitor.findUnique({
    where: { id: access.id },
    select: { documentBackBytes: true, documentBackMime: true, documentBackUpdatedAt: true },
  });

  return { ok: true, visitor };
}
