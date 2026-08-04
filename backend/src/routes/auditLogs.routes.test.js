import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import auditLogsRoutes from "./auditLogs.routes.js";
import { sessionJwtSignOptions } from "../config/auth.js";
import {
  errorHandler,
  normalizeErrorResponses,
  notFoundHandler,
} from "../middlewares/errorHandler.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-32-characters-safe";

function signSession(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(userId));
}

function withPrismaMocks({ authUser, total = 0, items = [], fail = null } = {}, fn) {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalCount = prisma.auditLog.count;
  const originalFindMany = prisma.auditLog.findMany;
  const originalTransaction = prisma.$transaction;
  const calls = { findMany: null };

  prisma.user.findUnique = async () => authUser ?? null;
  prisma.auditLog.count = (args) => {
    if (fail === "count") throw new Error("select * from audit_logs");
    return Promise.resolve(total);
  };
  prisma.auditLog.findMany = (args) => {
    calls.findMany = args;
    if (fail === "findMany") throw new Error("select * from audit_logs");
    return Promise.resolve(items);
  };
  prisma.$transaction = async (operations) => Promise.all(operations);

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      prisma.user.findUnique = originalUserFindUnique;
      prisma.auditLog.count = originalCount;
      prisma.auditLog.findMany = originalFindMany;
      prisma.$transaction = originalTransaction;
    });
}

async function requestAuditLogs({ token, query = "" } = {}) {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  app.use("/audit-logs", auditLogsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const response = await fetch(`http://127.0.0.1:${port}/audit-logs${query}`, { headers });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /audit-logs requires authentication", async () => {
  const response = await requestAuditLogs();

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "AUTH_REQUIRED");
});

test("GET /audit-logs denies RECEPCAO", async () => {
  const response = await withPrismaMocks(
    {
      authUser: {
        id: 2,
        username: "recepcao",
        role: "RECEPCAO",
        branchId: 3,
        isActive: true,
        branch: { name: "Filial" },
      },
    },
    () => requestAuditLogs({ token: signSession(2) })
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "FORBIDDEN");
});

test("GET /audit-logs allows ADMIN and returns paginated response", async () => {
  const item = {
    id: 10,
    createdAt: "2026-08-03T12:00:00.000Z",
    userId: 1,
    branchId: 3,
    action: "LOGIN",
    entity: "AUTH",
    entityId: null,
    description: "Login",
    metadata: { method: "password" },
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
    requestId: "req-1",
    user: { id: 1, username: "admin" },
    branch: { id: 3, name: "Filial" },
  };

  const response = await withPrismaMocks(
    {
      authUser: {
        id: 1,
        username: "admin",
        role: "ADMIN",
        branchId: 3,
        isActive: true,
        branch: { name: "Filial" },
      },
      total: 1,
      items: [item],
    },
    () => requestAuditLogs({ token: signSession(1) })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    items: [item],
    pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
  });
  assert.equal(JSON.stringify(response.body).includes("passwordHash"), false);
});

test("GET /audit-logs rejects invalid and unknown query values", async () => {
  const authUser = {
    id: 1,
    username: "admin",
    role: "ADMIN",
    branchId: 3,
    isActive: true,
    branch: { name: "Filial" },
  };

  for (const query of ["?page=0", "?pageSize=101", "?from=2026-08-04&to=2026-08-03", "?sort=id"]) {
    const response = await withPrismaMocks({ authUser }, () =>
      requestAuditLogs({ token: signSession(1), query })
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
  }
});

test("GET /audit-logs forwards unexpected Prisma errors without leaking stack or query", async () => {
  const response = await withPrismaMocks(
    {
      authUser: {
        id: 1,
        username: "admin",
        role: "ADMIN",
        branchId: 3,
        isActive: true,
        branch: { name: "Filial" },
      },
      fail: "findMany",
    },
    () => requestAuditLogs({ token: signSession(1) })
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.equal(response.body.message, "Erro interno");
  assert.equal(JSON.stringify(response.body).includes("select * from audit_logs"), false);
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
});

test("no audit log mutation routes are exposed", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const app = express();
    app.use(express.json());
    app.use(normalizeErrorResponses);
    app.use("/audit-logs", auditLogsRoutes);
    app.use(notFoundHandler);
    app.use(errorHandler);

    const server = app.listen(0);
    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/audit-logs`, { method });
      assert.equal(response.status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
