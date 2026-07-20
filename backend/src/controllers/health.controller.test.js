import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import prisma from "../lib/prisma.js";
import { requestContext } from "../middlewares/requestContext.js";
import healthRoutes from "../routes/health.routes.js";

async function withMocks({ queryRaw, access }, fn) {
  const originalQueryRaw = prisma.$queryRaw;
  const originalAccess = fs.promises.access;
  prisma.$queryRaw = queryRaw;
  fs.promises.access = access;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      prisma.$queryRaw = originalQueryRaw;
      fs.promises.access = originalAccess;
    });
}

async function requestReady() {
  const app = express();
  app.use(requestContext);
  app.use("/health", healthRoutes);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    return {
      response,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestLive() {
  const app = express();
  app.use(requestContext);
  app.use("/health", healthRoutes);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    return {
      response,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("liveness keeps the existing public health contract", async () => {
  const { response, body } = await requestLive();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.message, "string");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/i);
});

test("readiness returns 200 when database and storage are healthy", async () => {
  const { response, body } = await withMocks(
    {
      queryRaw: async () => [{ "?column?": 1 }],
      access: async () => {},
    },
    requestReady
  );

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, database: "up", storage: "up" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/i);
});

test("readiness returns 503 when database is down", async () => {
  const { response, body } = await withMocks(
    {
      queryRaw: async () => {
        throw new Error("postgresql://secret");
      },
      access: async () => {},
    },
    requestReady
  );

  assert.equal(response.status, 503);
  assert.deepEqual(body, { ok: false, database: "down", storage: "up" });
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("readiness returns 503 when storage is down", async () => {
  const { response, body } = await withMocks(
    {
      queryRaw: async () => [{ "?column?": 1 }],
      access: async () => {
        throw new Error("C:/secret/path");
      },
    },
    requestReady
  );

  assert.equal(response.status, 503);
  assert.deepEqual(body, { ok: false, database: "up", storage: "down" });
  assert.equal(JSON.stringify(body).includes("C:/secret/path"), false);
});

test("readiness returns 503 when database and storage are down", async () => {
  const { response, body } = await withMocks(
    {
      queryRaw: async () => {
        throw new Error("db down");
      },
      access: async () => {
        throw new Error("storage down");
      },
    },
    requestReady
  );

  assert.equal(response.status, 503);
  assert.deepEqual(body, { ok: false, database: "down", storage: "down" });
});

test("readiness database check has a bounded timeout", async () => {
  const startedAt = performance.now();
  const { response, body } = await withMocks(
    {
      queryRaw: () => new Promise(() => {}),
      access: async () => {},
    },
    requestReady
  );
  const durationMs = performance.now() - startedAt;

  assert.equal(response.status, 503);
  assert.deepEqual(body, { ok: false, database: "down", storage: "up" });
  assert.ok(durationMs < 2500);
});
