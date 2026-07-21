import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import authRoutes from "./auth.routes.js";
import { sessionJwtSignOptions } from "../config/auth.js";
import {
  errorHandler,
  normalizeErrorResponses,
  notFoundHandler,
} from "../middlewares/errorHandler.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

function signSession(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(userId));
}

function withPrismaMocks(mocks, fn) {
  const originals = [];

  for (const [model, methods] of Object.entries(mocks)) {
    for (const [method, replacement] of Object.entries(methods)) {
      originals.push([model, method, prisma[model][method]]);
      prisma[model][method] = replacement;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [model, method, original] of originals.reverse()) {
        prisma[model][method] = original;
      }
    });
}

async function requestMe({ token } = {}) {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  app.use("/auth", authRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const response = await fetch(`http://127.0.0.1:${port}/auth/me`, { headers });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /auth/me requires token", async () => {
  const response = await requestMe();

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "AUTH_REQUIRED");
});

test("GET /auth/me returns current safe user from database", async () => {
  const response = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({
          id: 7,
          username: "recepcao",
          passwordHash: "hash-nao-retornar",
          role: "RECEPCAO",
          branchId: 3,
          isActive: true,
          branch: { name: "Dimebras SP" },
        }),
      },
    },
    () => requestMe({ token: signSession(7) })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    user: {
      id: 7,
      username: "recepcao",
      role: "RECEPCAO",
      branch: { id: 3, name: "Dimebras SP" },
    },
  });
  assert.equal(JSON.stringify(response.body).includes("password"), false);
  assert.equal(JSON.stringify(response.body).includes("hash"), false);
});

test("GET /auth/me rejects user deactivated after login", async () => {
  const response = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({
          id: 7,
          username: "recepcao",
          role: "RECEPCAO",
          branchId: 3,
          isActive: false,
          branch: { name: "Dimebras SP" },
        }),
      },
    },
    () => requestMe({ token: signSession(7) })
  );

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "USER_INACTIVE");
});

test("GET /auth/me reflects role and branch changes from database", async () => {
  const response = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({
          id: 7,
          username: "admin",
          role: "ADMIN",
          branchId: 9,
          isActive: true,
          branch: { name: "Nova Filial" },
        }),
      },
    },
    () => requestMe({ token: signSession(7) })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.user, {
    id: 7,
    username: "admin",
    role: "ADMIN",
    branch: { id: 9, name: "Nova Filial" },
  });
});
