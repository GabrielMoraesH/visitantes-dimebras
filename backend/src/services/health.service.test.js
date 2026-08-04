import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/prisma.js";
import { checkDatabase, getHealthStatus } from "./health.service.js";

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

test("getHealthStatus returns ok payload with version, timestamp and uptime", async () => {
  const result = await withQueryRawMock(
    async () => [{ "?column?": 1 }],
    getHealthStatus
  );

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.status, "ok");
  assert.deepEqual(result.body.database, { status: "ok" });
  assert.doesNotThrow(() => new Date(result.body.timestamp).toISOString());
  assert.equal(new Date(result.body.timestamp).toISOString(), result.body.timestamp);
  assert.equal(typeof result.body.uptimeSeconds, "number");
  assert.ok(result.body.uptimeSeconds >= 0);
  assert.equal(typeof result.body.version, "string");
  assert.ok(result.body.version.length > 0);
});

test("getHealthStatus returns degraded payload without Prisma details on failure", async () => {
  const prismaError = new Error("DATABASE_URL=postgresql://user:pass@host/db");
  prismaError.code = "P1001";
  prismaError.stack = "stack trace with credentials";

  const result = await withQueryRawMock(async () => {
    throw prismaError;
  }, getHealthStatus);

  const serialized = JSON.stringify(result.body);

  assert.equal(result.httpStatus, 503);
  assert.equal(result.body.status, "degraded");
  assert.deepEqual(result.body.database, { status: "error" });
  assert.equal(serialized.includes("DATABASE_URL"), false);
  assert.equal(serialized.includes("postgresql://"), false);
  assert.equal(serialized.includes("stack trace"), false);
  assert.equal(serialized.includes("P1001"), false);
});

test("getHealthStatus times out a stuck database check", async () => {
  const startedAt = performance.now();
  const result = await withQueryRawMock(() => new Promise(() => {}), getHealthStatus);
  const durationMs = performance.now() - startedAt;

  assert.equal(result.httpStatus, 503);
  assert.equal(result.body.status, "degraded");
  assert.deepEqual(result.body.database, { status: "error" });
  assert.ok(durationMs < 2500);
});
