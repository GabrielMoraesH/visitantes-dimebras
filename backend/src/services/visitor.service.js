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
  name: trimmedString(LIMITS.name, "Nome invalido").min(2, "Nome invalido"),
  cpf: cpfSchema,
  phone: phoneSchema,
  company: optionalTrimmedString(LIMITS.company),
}).strict();

const updateVisitorSchema = z.object({
  phone: phoneSchema.optional(),
  company: optionalTrimmedString(LIMITS.company).optional(),
}).strict();

function validateVisitorFile(file) {
  if (!file) return null;
  return validateMagicBytes(file, VISITOR_IMAGE_MIMES);
}

function buildVisitorFileUpdate(files) {
  const data = {};

  const fileFields = [
    ["photo", "photoBytes", "photoMime", "photoUpdatedAt"],
    ["documentFront", "documentFrontBytes", "documentFrontMime", "documentFrontUpdatedAt"],
    ["documentBack", "documentBackBytes", "documentBackMime", "documentBackUpdatedAt"],
  ];

  for (const [fileKey, bytesKey, mimeKey, updatedAtKey] of fileFields) {
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
