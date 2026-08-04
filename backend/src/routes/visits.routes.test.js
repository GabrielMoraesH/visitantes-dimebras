import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { sessionJwtSignOptions } from "../config/auth.js";
import {
  errorHandler,
  normalizeErrorResponses,
  notFoundHandler,
} from "../middlewares/errorHandler.js";
import visitRoutes from "./visits.routes.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-32-characters-safe";

function signSession(userId = 7) {
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

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  app.use("/visits", visitRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

async function requestCheckin(body) {
  const app = makeApp();
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/visits/checkin`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${signSession()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST /visits/checkin allows old photo when documents are recent", async () => {
  let createArgs;

  const response = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({
          id: 7,
          username: "recepcao",
          role: "RECEPCAO",
          branchId: 1,
          isActive: true,
          branch: { name: "Filial A" },
        }),
      },
      visitor: {
        findUnique: async (args) => {
          if (args.select) return { id: 55, createdInBranchId: 1 };
          return {
            id: 55,
            createdInBranchId: 1,
            photoBytes: Buffer.from("p"),
            photoMime: "image/jpeg",
            photoUpdatedAt: new Date("2010-01-01T00:00:00.000Z"),
            documentFrontBytes: Buffer.from("f"),
            documentFrontMime: "image/jpeg",
            documentFrontUpdatedAt: new Date(),
            documentBackBytes: Buffer.from("b"),
            documentBackMime: "image/jpeg",
            documentBackUpdatedAt: new Date(),
          };
        },
      },
      branch: {
        findUnique: async () => ({ id: 1, name: "Filial A" }),
      },
      visit: {
        findFirst: async () => null,
        create: async (args) => {
          createArgs = args;
          return { id: 10, ...args.data };
        },
      },
      auditLog: {
        create: async () => ({ id: 1 }),
      },
    },
    () =>
      requestCheckin({
        visitorId: 55,
        areaToVisit: "Recepcao",
        attendedBy: "Maria",
        serviceType: "Reuniao",
      })
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.id, 10);
  assert.equal(createArgs.data.visitorId, 55);
});
