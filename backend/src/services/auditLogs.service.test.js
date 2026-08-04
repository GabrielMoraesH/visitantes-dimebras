import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/prisma.js";
import {
  AUDIT_LOG_DATE_TIMEZONE,
  AUDIT_LOG_SAFE_SELECT,
  listAuditLogs,
} from "./auditLogs.service.js";

function auditLog(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    createdAt: overrides.createdAt ?? new Date("2026-08-03T12:00:00Z"),
    userId: overrides.userId ?? null,
    branchId: overrides.branchId ?? null,
    action: overrides.action ?? "LOGIN",
    entity: overrides.entity ?? "AUTH",
    entityId: overrides.entityId ?? null,
    description: overrides.description ?? null,
    metadata: overrides.metadata ?? null,
    ipAddress: overrides.ipAddress ?? null,
    userAgent: overrides.userAgent ?? null,
    requestId: overrides.requestId ?? null,
    user: overrides.user ?? null,
    branch: overrides.branch ?? null,
  };
}

function withPrismaMocks({ total = 0, items = [], fail = null } = {}, fn) {
  const originalCount = prisma.auditLog.count;
  const originalFindMany = prisma.auditLog.findMany;
  const originalTransaction = prisma.$transaction;
  const calls = { count: null, findMany: null, transaction: null };

  prisma.auditLog.count = (args) => {
    calls.count = args;
    if (fail === "count") throw new Error("select * from audit_logs");
    return Promise.resolve(total);
  };

  prisma.auditLog.findMany = (args) => {
    calls.findMany = args;
    if (fail === "findMany") throw new Error("select * from audit_logs");
    return Promise.resolve(items);
  };

  prisma.$transaction = async (operations) => {
    calls.transaction = operations;
    return Promise.all(operations);
  };

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      prisma.auditLog.count = originalCount;
      prisma.auditLog.findMany = originalFindMany;
      prisma.$transaction = originalTransaction;
    });
}

test("uses default pagination and safe fixed query", async () => {
  await withPrismaMocks({ total: 0, items: [] }, async (calls) => {
    const result = await listAuditLogs({ query: {} });

    assert.deepEqual(result, {
      items: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    });
    assert.deepEqual(calls.count, { where: {} });
    assert.equal(calls.findMany.skip, 0);
    assert.equal(calls.findMany.take, 50);
    assert.deepEqual(calls.findMany.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.deepEqual(calls.findMany.select, AUDIT_LOG_SAFE_SELECT);
    assert.equal(calls.transaction.length, 2);
  });
});

test("applies pageSize maximum and calculates totalPages", async () => {
  await withPrismaMocks({ total: 201, items: [auditLog()] }, async () => {
    const result = await listAuditLogs({ query: { page: "2", pageSize: "100" } });

    assert.equal(result.pagination.page, 2);
    assert.equal(result.pagination.pageSize, 100);
    assert.equal(result.pagination.total, 201);
    assert.equal(result.pagination.totalPages, 3);
  });
});

test("calculates skip and take", async () => {
  await withPrismaMocks({ total: 60, items: [] }, async (calls) => {
    await listAuditLogs({ query: { page: "3", pageSize: "25" } });

    assert.equal(calls.findMany.skip, 50);
    assert.equal(calls.findMany.take, 25);
  });
});

test("rejects invalid page and pageSize", async () => {
  for (const page of ["0", "-1", "1.5", "abc", "NaN"]) {
    await assert.rejects(listAuditLogs({ query: { page } }), { name: "ZodError" });
  }

  for (const pageSize of ["0", "-1", "1.5", "abc", "101"]) {
    await assert.rejects(listAuditLogs({ query: { pageSize } }), { name: "ZodError" });
  }
});

test("applies scalar filters and normalizes audit codes", async () => {
  await withPrismaMocks({ total: 1, items: [] }, async (calls) => {
    await listAuditLogs({
      query: {
        action: "visitor create",
        entity: "visítor",
        userId: "7",
        branchId: "3",
        entityId: "55",
        requestId: "req-123",
      },
    });

    assert.deepEqual(calls.findMany.where, {
      action: "VISITOR_CREATE",
      entity: "VISITOR",
      userId: 7,
      branchId: 3,
      entityId: "55",
      requestId: "req-123",
    });
  });
});

test("returns new audit events and keeps action/entity filters working", async () => {
  const item = auditLog({
    id: 44,
    action: "TV_CONTENT_CREATE",
    entity: "TV_CONTENT",
    entityId: "501",
    metadata: { mediaType: "IMAGE", branchCount: 2, active: true },
  });

  await withPrismaMocks({ total: 1, items: [item] }, async (calls) => {
    const result = await listAuditLogs({
      query: { action: "TV_CONTENT_CREATE", entity: "TV_CONTENT" },
    });

    assert.deepEqual(calls.findMany.where, {
      action: "TV_CONTENT_CREATE",
      entity: "TV_CONTENT",
    });
    assert.deepEqual(result.items, [item]);
  });
});

test("returns agenda and user audit events with technical filters", async () => {
  const agendaItem = auditLog({
    id: 45,
    action: "AGENDA_EVENT_UPDATE",
    entity: "AGENDA_EVENT",
    entityId: "801",
    metadata: {
      dateTimeChanged: true,
      detailsChanged: false,
      observationChanged: false,
    },
  });

  await withPrismaMocks({ total: 1, items: [agendaItem] }, async (calls) => {
    const result = await listAuditLogs({
      query: { action: "AGENDA_EVENT_UPDATE", entity: "AGENDA_EVENT" },
    });

    assert.deepEqual(calls.findMany.where, {
      action: "AGENDA_EVENT_UPDATE",
      entity: "AGENDA_EVENT",
    });
    assert.deepEqual(result.items, [agendaItem]);
  });

  const userItem = auditLog({
    id: 46,
    action: "USER_CREATE",
    entity: "USER",
    entityId: "901",
    metadata: { role: "RECEPCAO", branchId: 2, active: true },
  });

  await withPrismaMocks({ total: 1, items: [userItem] }, async (calls) => {
    const result = await listAuditLogs({
      query: { action: "USER_CREATE", entity: "USER" },
    });

    assert.deepEqual(calls.findMany.where, {
      action: "USER_CREATE",
      entity: "USER",
    });
    assert.deepEqual(result.items, [userItem]);
  });
});

test("returns visit label audit events with technical filters", async () => {
  const item = auditLog({
    id: 47,
    action: "VISIT_LABEL_GENERATE",
    entity: "VISIT",
    entityId: "401",
    metadata: { reprint: false },
  });

  await withPrismaMocks({ total: 1, items: [item] }, async (calls) => {
    const result = await listAuditLogs({
      query: { action: "VISIT_LABEL_GENERATE", entity: "VISIT" },
    });

    assert.deepEqual(calls.findMany.where, {
      action: "VISIT_LABEL_GENERATE",
      entity: "VISIT",
    });
    assert.deepEqual(result.items, [item]);
  });
});

test("applies date filters inclusively using documented timezone for date-only inputs", async () => {
  assert.equal(AUDIT_LOG_DATE_TIMEZONE, "America/Sao_Paulo (UTC-03:00)");

  await withPrismaMocks({ total: 1, items: [] }, async (calls) => {
    await listAuditLogs({ query: { from: "2026-08-03", to: "2026-08-04" } });

    assert.equal(calls.findMany.where.createdAt.gte.toISOString(), "2026-08-03T03:00:00.000Z");
    assert.equal(calls.findMany.where.createdAt.lte.toISOString(), "2026-08-05T02:59:59.999Z");
  });
});

test("applies from-only, to-only, and ISO datetime filters", async () => {
  await withPrismaMocks({ total: 1, items: [] }, async (calls) => {
    await listAuditLogs({ query: { from: "2026-08-03T10:00:00.000Z" } });
    assert.equal(calls.findMany.where.createdAt.gte.toISOString(), "2026-08-03T10:00:00.000Z");
    assert.equal(calls.findMany.where.createdAt.lte, undefined);
  });

  await withPrismaMocks({ total: 1, items: [] }, async (calls) => {
    await listAuditLogs({ query: { to: "2026-08-03T20:00:00.000Z" } });
    assert.equal(calls.findMany.where.createdAt.gte, undefined);
    assert.equal(calls.findMany.where.createdAt.lte.toISOString(), "2026-08-03T20:00:00.000Z");
  });
});

test("rejects inverted date range and unknown filters", async () => {
  await assert.rejects(
    listAuditLogs({ query: { from: "2026-08-04", to: "2026-08-03" } }),
    { name: "ZodError" }
  );
  await assert.rejects(listAuditLogs({ query: { sort: "createdAt" } }), { name: "ZodError" });
});

test("returns safe shape with null user and branch", async () => {
  const item = auditLog({ metadata: { changedFields: ["name"] }, user: null, branch: null });

  await withPrismaMocks({ total: 1, items: [item] }, async () => {
    const result = await listAuditLogs({ query: {} });

    assert.deepEqual(result.items, [item]);
    assert.equal(result.items[0].user, null);
    assert.equal(result.items[0].branch, null);
    assert.deepEqual(result.items[0].metadata, { changedFields: ["name"] });
    assert.equal(result.items[0].visitor, undefined);
    assert.equal(JSON.stringify(result.items).includes("passwordHash"), false);
    assert.equal(JSON.stringify(result.items).includes("token"), false);
  });
});

test("safe select exposes only explicit audit, user, and branch fields", () => {
  assert.deepEqual(Object.keys(AUDIT_LOG_SAFE_SELECT).sort(), [
    "action",
    "branch",
    "branchId",
    "createdAt",
    "description",
    "entity",
    "entityId",
    "id",
    "ipAddress",
    "metadata",
    "requestId",
    "user",
    "userAgent",
    "userId",
  ]);
  assert.deepEqual(AUDIT_LOG_SAFE_SELECT.user.select, { id: true, username: true });
  assert.deepEqual(AUDIT_LOG_SAFE_SELECT.branch.select, { id: true, name: true });
});

test("propagates Prisma failures", async () => {
  await assert.rejects(
    withPrismaMocks({ fail: "findMany" }, () => listAuditLogs({ query: {} })),
    /select \* from audit_logs/
  );
});
