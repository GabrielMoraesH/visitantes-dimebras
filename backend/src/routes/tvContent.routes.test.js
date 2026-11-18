import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import tvContentRoutes from "./tvContent.routes.js";
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

function withPrismaMocks({ authUser, receptionAccount, contentItems = [], activeItems = [] }, fn) {
  const originalUserFindUnique = prisma.user.findUnique;
  const originalBranchFindUnique = prisma.branch.findUnique;
  const originalContentFindMany = prisma.tvContent.findMany;
  const calls = [];

  prisma.user.findUnique = async ({ where }) => {
    if (where?.id === authUser.id) return authUser;
    if (where?.id === receptionAccount?.id) return receptionAccount;
    return null;
  };
  prisma.branch.findUnique = async () => ({ id: receptionAccount?.branchId });
  prisma.tvContent.findMany = async (args) => {
    calls.push(args);
    return args.where?.isActive ? activeItems : contentItems;
  };

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      prisma.user.findUnique = originalUserFindUnique;
      prisma.branch.findUnique = originalBranchFindUnique;
      prisma.tvContent.findMany = originalContentFindMany;
    });
}

async function requestTvContents({ token, path = "/" } = {}) {
  const app = express();
  app.use(normalizeErrorResponses);
  app.use("/tv-content", tvContentRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const response = await fetch(`http://127.0.0.1:${port}/tv-content${path}`, { headers });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

for (const role of ["ADMIN", "RECEPCAO_TV"]) {
  test(`GET /tv-content/ allows ${role}`, async () => {
    const user = { id: role === "ADMIN" ? 1 : 2, username: role.toLowerCase(), role, branchId: 4, isActive: true };
    const receptionAccount = { id: 2, role: "RECEPCAO_TV", isActive: true, branchId: 4 };
    await withPrismaMocks({ authUser: user, receptionAccount, contentItems: [{ id: 7, branches: [] }] }, async (calls) => {
      const response = await requestTvContents({ token: signSession(user.id) });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, [{ id: 7, branches: [] }]);
      assert.deepEqual(calls[0].where, role === "ADMIN" ? {} : {
        branches: { some: { branchId: 4 }, none: { branchId: { not: 4 } } },
      });
    });
  });

  test(`GET /tv-content/active allows ${role}`, async () => {
    const user = { id: role === "ADMIN" ? 1 : 2, username: role.toLowerCase(), role, branchId: 4, isActive: true };
    const receptionAccount = { id: 2, role: "RECEPCAO_TV", isActive: true, branchId: 4 };
    await withPrismaMocks({ authUser: user, receptionAccount, activeItems: [{ id: 8, isActive: true, branches: [] }] }, async () => {
      const response = await requestTvContents({ token: signSession(user.id), path: "/active" });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, [{ id: 8, isActive: true, branches: [] }]);
    });
  });
}

test("RECEPCAO_TV still cannot access an ADMIN-only route", async () => {
  const app = express();
  const branchesRoutes = (await import("./branches.routes.js")).default;
  app.use("/branches", branchesRoutes);
  app.use(normalizeErrorResponses);
  app.use(notFoundHandler);
  app.use(errorHandler);
  const authUser = {
    id: 2,
    username: "recepcao_tv",
    role: "RECEPCAO_TV",
    branchId: 4,
    isActive: true,
    branch: { name: "Filial" },
  };
  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => authUser;
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/branches`, {
      headers: { authorization: `Bearer ${signSession(2)}` },
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    prisma.user.findUnique = originalFindUnique;
  }
});
