import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import prisma from "../lib/prisma.js";
import {
  errorHandler,
  normalizeErrorResponses,
  notFoundHandler,
} from "../middlewares/errorHandler.js";
import { requestContext } from "../middlewares/requestContext.js";
import healthRoutes from "../routes/health.routes.js";

function withQueryRawMock(queryRaw, fn) {
  const originalQueryRaw = prisma.$queryRaw;
  prisma.$queryRaw = queryRaw;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      prisma.$queryRaw = originalQueryRaw;
    });
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use(normalizeErrorResponses);
  app.use("/health", healthRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

async function requestHealth(headers = {}) {
  const app = makeApp();
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/health`, { headers });
    const body = await response.json();
    return { response, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestReady() {
  const app = makeApp();
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/health/ready`);
    const body = await response.json();
    return { response, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertBasePayload(body) {
  assert.doesNotThrow(() => new Date(body.timestamp).toISOString());
  assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);
  assert.equal(typeof body.uptimeSeconds, "number");
  assert.ok(body.uptimeSeconds >= 0);
  assert.equal(typeof body.version, "string");
  assert.ok(body.version.length > 0);
}

test("GET /health returns 200 with liveness shape and does not check Prisma", async () => {
  let queryCount = 0;

  const { response, body } = await withQueryRawMock(() => {
    queryCount += 1;
    throw new Error("database unavailable");
  }, requestHealth);

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), [
    "status",
    "timestamp",
    "uptimeSeconds",
    "version",
  ]);
  assert.equal(body.status, "ok");
  assertBasePayload(body);
  assert.equal(queryCount, 0);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET /health is public and does not require authentication", async () => {
  const { response, body } = await requestHealth();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
});

test("GET /health ignores authorization header and keeps the same public contract", async () => {
  const { response, body } = await requestHealth({
    authorization: "Bearer invalid-token",
  });

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(Object.hasOwn(body, "database"), false);
});

test("GET /health/ready returns 200 with readiness shape when database is healthy", async () => {
  let queryCount = 0;
  let queryText = "";

  const { response, body } = await withQueryRawMock((strings) => {
    queryCount += 1;
    queryText = strings.join("");
    return Promise.resolve([{ "?column?": 1 }]);
  }, requestReady);

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), [
    "database",
    "status",
    "timestamp",
    "uptimeSeconds",
    "version",
  ]);
  assert.equal(body.status, "ok");
  assert.deepEqual(body.database, { status: "ok" });
  assertBasePayload(body);
  assert.equal(queryCount, 1);
  assert.equal(queryText.trim(), "SELECT 1");
  assert.equal(Object.hasOwn(body, "storage"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET /health/ready is public and does not require authentication", async () => {
  const { response, body } = await withQueryRawMock(
    async () => [{ "?column?": 1 }],
    requestReady
  );

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
});

test("GET /health/ready returns 503 without sensitive details when database fails", async () => {
  const sensitiveError = new Error(
    `Prisma failed with ${process.env.DATABASE_URL || "postgresql://user:pass@host/db"}`
  );
  sensitiveError.stack = "Stack trace with DATABASE_URL and secret internals";

  const { response, body } = await withQueryRawMock(async () => {
    throw sensitiveError;
  }, requestReady);

  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.database, { status: "error" });
  assert.equal(serialized.includes("Prisma failed"), false);
  assert.equal(serialized.includes("Stack trace"), false);
  assert.equal(serialized.includes("DATABASE_URL"), false);
  assert.equal(serialized.includes("postgresql://"), false);
  assert.equal(serialized.includes("user:pass"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET /health/ready handles unexpected database check failures without exposing details", async () => {
  const { response, body } = await withQueryRawMock(async () => {
    throw "unexpected secret failure";
  }, requestReady);

  assert.equal(response.status, 503);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.database, { status: "error" });
  assert.equal(JSON.stringify(body).includes("unexpected secret failure"), false);
});

test("GET /health/ready returns 503 on database timeout", async () => {
  const startedAt = performance.now();
  const { response, body } = await withQueryRawMock(
    () => new Promise(() => {}),
    requestReady
  );
  const durationMs = performance.now() - startedAt;

  assert.equal(response.status, 503);
  assert.equal(body.status, "degraded");
  assert.deepEqual(body.database, { status: "error" });
  assert.ok(durationMs < 2500);
});
