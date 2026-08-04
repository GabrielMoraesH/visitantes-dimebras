import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/prisma.js";
import { checkDatabase, getLiveness, getReadiness } from "./health.service.js";

function withQueryRawMock(queryRaw, fn) {
  const originalQueryRaw = prisma.$queryRaw;
  prisma.$queryRaw = queryRaw;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      prisma.$queryRaw = originalQueryRaw;
    });
}

test("checkDatabase uses only the minimal SELECT 1 query", async () => {
  let queryCount = 0;
  let queryText = "";

  await withQueryRawMock((strings) => {
    queryCount += 1;
    queryText = strings.join("");
    return Promise.resolve([{ "?column?": 1 }]);
  }, checkDatabase);

  assert.equal(queryCount, 1);
  assert.equal(queryText.trim(), "SELECT 1");
});

function assertBasePayload(body) {
  assert.doesNotThrow(() => new Date(body.timestamp).toISOString());
  assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);
  assert.equal(typeof body.uptimeSeconds, "number");
  assert.ok(body.uptimeSeconds >= 0);
  assert.equal(typeof body.version, "string");
  assert.ok(body.version.length > 0);
}

test("getLiveness returns ok payload without checking Prisma", async () => {
  let queryCount = 0;

  const result = await withQueryRawMock(() => {
    queryCount += 1;
    throw new Error("database unavailable");
  }, getLiveness);

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.status, "ok");
  assertBasePayload(result.body);
  assert.equal(Object.hasOwn(result.body, "database"), false);
  assert.equal(queryCount, 0);
});

test("getReadiness returns ok payload with version, timestamp, uptime and database status", async () => {
  const result = await withQueryRawMock(
    async () => [{ "?column?": 1 }],
    getReadiness
  );

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.status, "ok");
  assert.deepEqual(result.body.database, { status: "ok" });
  assertBasePayload(result.body);
});

test("getReadiness returns degraded payload without Prisma details on failure", async () => {
  const prismaError = new Error("DATABASE_URL=postgresql://user:pass@host/db");
  prismaError.code = "P1001";
  prismaError.stack = "stack trace with credentials";

  const result = await withQueryRawMock(async () => {
    throw prismaError;
  }, getReadiness);

  const serialized = JSON.stringify(result.body);

  assert.equal(result.httpStatus, 503);
  assert.equal(result.body.status, "degraded");
  assert.deepEqual(result.body.database, { status: "error" });
  assert.equal(serialized.includes("DATABASE_URL"), false);
  assert.equal(serialized.includes("postgresql://"), false);
  assert.equal(serialized.includes("stack trace"), false);
  assert.equal(serialized.includes("P1001"), false);
});

test("getReadiness times out a stuck database check", async () => {
  const startedAt = performance.now();
  const result = await withQueryRawMock(() => new Promise(() => {}), getReadiness);
  const durationMs = performance.now() - startedAt;

  assert.equal(result.httpStatus, 503);
  assert.equal(result.body.status, "degraded");
  assert.deepEqual(result.body.database, { status: "error" });
  assert.ok(durationMs < 2500);
});
