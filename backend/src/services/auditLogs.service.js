import { z } from "zod";
import prisma from "../lib/prisma.js";

const AUDIT_LOG_QUERY_LIMITS = {
  action: 80,
  entity: 80,
  entityId: 120,
  requestId: 120,
  page: 10000,
  pageSize: 100,
};

const SAO_PAULO_OFFSET = "-03:00";

const positiveIntQuery = (field, max) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, `${field} invalido`)
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(max, `${field} invalido`));

const limitedStringQuery = (field, max) =>
  z.string().trim().min(1, `${field} invalido`).max(max, `${field} muito longo`);

function normalizeAuditCode(value) {
  return String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();
}

const auditCodeQuery = (field, max) =>
  z
    .string()
    .trim()
    .min(1, `${field} invalido`)
    .max(max, `${field} muito longo`)
    .transform(normalizeAuditCode)
    .refine((value) => value.length > 0, `${field} invalido`);

function parseIsoDate(value, field, boundary) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const calendarDate = new Date(year, month - 1, day);

    if (
      Number.isNaN(calendarDate.getTime()) ||
      calendarDate.getFullYear() !== year ||
      calendarDate.getMonth() + 1 !== month ||
      calendarDate.getDate() !== day
    ) {
      throw new Error(`${field} invalido`);
    }

    const time = boundary === "end" ? "23:59:59.999" : "00:00:00.000";
    const date = new Date(`${value}T${time}${SAO_PAULO_OFFSET}`);
    return date;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} invalido`);
  }

  return date;
}

const dateFilterQuery = (field, boundary) =>
  z.string().trim().min(1, `${field} invalido`).transform((value) => parseIsoDate(value, field, boundary));

const auditLogsQuerySchema = z
  .object({
    page: positiveIntQuery("page", AUDIT_LOG_QUERY_LIMITS.page).optional(),
    pageSize: positiveIntQuery("pageSize", AUDIT_LOG_QUERY_LIMITS.pageSize)
      .optional(),
    action: auditCodeQuery("action", AUDIT_LOG_QUERY_LIMITS.action).optional(),
    entity: auditCodeQuery("entity", AUDIT_LOG_QUERY_LIMITS.entity).optional(),
    userId: positiveIntQuery("userId", Number.MAX_SAFE_INTEGER).optional(),
    branchId: positiveIntQuery("branchId", Number.MAX_SAFE_INTEGER).optional(),
    entityId: limitedStringQuery("entityId", AUDIT_LOG_QUERY_LIMITS.entityId).optional(),
    requestId: limitedStringQuery("requestId", AUDIT_LOG_QUERY_LIMITS.requestId).optional(),
    from: dateFilterQuery("from", "start").optional(),
    to: dateFilterQuery("to", "end").optional(),
  })
  .strict();

export const AUDIT_LOG_SAFE_SELECT = {
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
  user: {
    select: {
      id: true,
      username: true,
    },
  },
  branch: {
    select: {
      id: true,
      name: true,
    },
  },
};

function buildWhere(filters) {
  const where = {};

  for (const field of ["action", "entity", "userId", "branchId", "entityId", "requestId"]) {
    if (filters[field] !== undefined) where[field] = filters[field];
  }

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  return where;
}

export async function listAuditLogs({ query }) {
  const filters = auditLogsQuerySchema.parse(query);

  if (filters.from && filters.to && filters.from > filters.to) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["from"],
        message: "from deve ser menor ou igual a to",
      },
    ]);
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const skip = (page - 1) * pageSize;
  const where = buildWhere(filters);

  const [total, items] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: AUDIT_LOG_SAFE_SELECT,
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

export const AUDIT_LOG_DATE_TIMEZONE = "America/Sao_Paulo (UTC-03:00)";
