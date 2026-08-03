import { z } from "zod";
import prisma from "../lib/prisma.js";

const AUDIT_LIMITS = {
  action: 80,
  entity: 80,
  entityId: 120,
  description: 500,
  ipAddress: 64,
  userAgent: 500,
  requestId: 120,
  metadataDepth: 5,
  metadataKeys: 50,
  metadataBytes: 8000,
};

const SENSITIVE_METADATA_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "authorization",
  "jwt",
  "secret",
  "documentfrontbytes",
  "documentbackbytes",
  "photobytes",
  "cpf",
  "document",
  "file",
  "buffer",
]);

const AUDIT_LOG_SELECT = {
  id: true,
  createdAt: true,
  userId: true,
  branchId: true,
  action: true,
  entity: true,
  entityId: true,
  description: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  requestId: true,
};

function normalizeAuditCode(value, field, max) {
  const normalized = String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();

  if (!normalized) {
    throw new Error(`${field} obrigatorio`);
  }

  if (normalized.length > max) {
    throw new Error(`${field} muito longo`);
  }

  return normalized;
}

function optionalString(max) {
  return z
    .union([z.string(), z.number().int(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;

      const text = String(value).trim();
      if (!text) return null;
      if (text.length > max) throw new Error("campo muito longo");

      return text;
    });
}

function isPlainObject(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSensitiveKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    SENSITIVE_METADATA_KEYS.has(normalized) ||
    normalized.includes("password") ||
    normalized.includes("token") ||
    normalized.includes("authorization") ||
    normalized.includes("secret") ||
    normalized.includes("cpf") ||
    normalized.includes("bytes") ||
    normalized.includes("buffer")
  );
}

function sanitizeMetadataValue(value, depth, seen, state) {
  if (depth > AUDIT_LIMITS.metadataDepth) {
    throw new Error("metadata com profundidade excessiva");
  }

  if (value === null) return null;

  const type = typeof value;

  if (type === "string" || type === "boolean") return value;
  if (type === "number") {
    if (!Number.isFinite(value)) throw new Error("metadata contem numero invalido");
    return value;
  }

  if (type === "bigint") throw new Error("metadata nao aceita BigInt");
  if (type === "function") throw new Error("metadata nao aceita funcao");
  if (type === "undefined") throw new Error("metadata nao aceita undefined");
  if (type === "symbol") throw new Error("metadata nao aceita symbol");

  if (Buffer.isBuffer(value)) throw new Error("metadata nao aceita Buffer");
  if (value instanceof Date) throw new Error("metadata nao aceita Date");

  if (seen.has(value)) throw new Error("metadata circular rejeitada");
  seen.add(value);

  if (Array.isArray(value)) {
    const sanitizedArray = value.map((item) => sanitizeMetadataValue(item, depth + 1, seen, state));
    seen.delete(value);
    return sanitizedArray;
  }

  if (!isPlainObject(value)) {
    throw new Error("metadata deve conter apenas objetos simples");
  }

  const sanitizedObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      throw new Error("metadata contem chave sensivel");
    }

    state.keyCount += 1;
    if (state.keyCount > AUDIT_LIMITS.metadataKeys) {
      throw new Error("metadata com chaves demais");
    }

    sanitizedObject[key] = sanitizeMetadataValue(item, depth + 1, seen, state);
  }

  seen.delete(value);
  return sanitizedObject;
}

function sanitizeMetadata(metadata) {
  if (metadata === undefined) return undefined;
  if (metadata === null) return null;

  if (!isPlainObject(metadata)) {
    throw new Error("metadata deve ser objeto JSON simples");
  }

  const sanitized = sanitizeMetadataValue(metadata, 0, new WeakSet(), { keyCount: 0 });
  const serialized = JSON.stringify(sanitized);

  if (Buffer.byteLength(serialized, "utf8") > AUDIT_LIMITS.metadataBytes) {
    throw new Error("metadata grande demais");
  }

  return sanitized;
}

const auditLogSchema = z
  .object({
    userId: z.number().int().positive("userId invalido").nullable().optional(),
    branchId: z.number().int().positive("branchId invalido").nullable().optional(),
    action: z
      .string()
      .trim()
      .min(1, "action obrigatorio")
      .transform((value) => normalizeAuditCode(value, "action", AUDIT_LIMITS.action)),
    entity: z
      .string()
      .trim()
      .min(1, "entity obrigatorio")
      .transform((value) => normalizeAuditCode(value, "entity", AUDIT_LIMITS.entity)),
    entityId: optionalString(AUDIT_LIMITS.entityId),
    description: optionalString(AUDIT_LIMITS.description),
    metadata: z.any().optional().nullable().transform(sanitizeMetadata),
    ipAddress: optionalString(AUDIT_LIMITS.ipAddress),
    userAgent: optionalString(AUDIT_LIMITS.userAgent),
    requestId: optionalString(AUDIT_LIMITS.requestId),
  })
  .strict();

function removeUndefined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

async function log(input) {
  const data = removeUndefined(auditLogSchema.parse(input));

  return prisma.auditLog.create({
    data,
    select: AUDIT_LOG_SELECT,
  });
}

// Audit logs are append-only. Keep metadata minimal and never store passwords,
// tokens, full CPF values, documents, buffers, or unnecessary PII here.
export const AuditService = {
  log,
};

export default AuditService;
