import test from "node:test";
import assert from "node:assert/strict";
import {
  documentRetentionClearData,
  updateExpiredDocumentsArgs,
} from "./document-retention.js";
import { runDocumentRetentionExecution } from "./run-document-retention.js";

const confirmation = "--confirm=DELETE_EXPIRED_DOCUMENTS";
const cutoff = new Date("2026-02-03T12:00:00.000Z");
const now = new Date("2026-08-03T12:00:00.000Z");
const safeEnv = { NODE_ENV: "production", DATABASE_URL: "postgresql://user:pass@localhost:5432/db" };

function candidate(overrides = {}) {
  return {
    id: 123,
    documentFrontUpdatedAt: new Date("2025-12-01T10:00:00.000Z"),
    documentBackUpdatedAt: new Date("2025-12-02T10:00:00.000Z"),
    createdInBranchId: 1,
    ...overrides,
  };
}

function outputBuffer() {
  let text = "";
  return {
    stream: { write: (chunk) => (text += chunk) },
    text: () => text,
  };
}

function mockPrisma({ candidates = [], updatedCount = 0, connectError, findError, updateError } = {}) {
  const calls = [];
  const visitorModel = {
    findMany: async (args) => {
      calls.push(["findMany", args]);
      if (findError) throw findError;
      return candidates;
    },
    updateMany: async (args) => {
      calls.push(["updateMany", args]);
      if (updateError) throw updateError;
      return { count: updatedCount };
    },
  };

  return {
    calls,
    visitor: visitorModel,
    $connect: async () => {
      calls.push(["$connect"]);
      if (connectError) throw connectError;
    },
    $disconnect: async () => {
      calls.push(["$disconnect"]);
    },
  };
}

async function execute({ argv = [confirmation], prisma = mockPrisma(), env = safeEnv } = {}) {
  const stdout = outputBuffer();
  const stderr = outputBuffer();
  const exitCode = await runDocumentRetentionExecution({
    argv,
    env,
    now,
    prisma,
    stdout: stdout.stream,
    stderr: stderr.stream,
    loadEnv: () => {},
  });

  return { exitCode, stdout: stdout.text(), stderr: stderr.text(), prisma };
}

test("without confirmation aborts and does not write", async () => {
  const prisma = mockPrisma();
  const result = await execute({ argv: [], prisma });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /--confirm=DELETE_EXPIRED_DOCUMENTS/);
  assert.deepEqual(prisma.calls, []);
});

test("wrong confirmation aborts", async () => {
  const prisma = mockPrisma();
  const result = await execute({ argv: ["--confirm=true"], prisma });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(prisma.calls, []);
});

test("bare confirmation flag aborts", async () => {
  const prisma = mockPrisma();
  const result = await execute({ argv: ["--confirm"], prisma });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(prisma.calls, []);
});

test("correct confirmation allows execution", async () => {
  const prisma = mockPrisma({ candidates: [candidate()], updatedCount: 1 });
  const result = await execute({ prisma });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    prisma.calls.map(([method]) => method),
    ["$connect", "findMany", "updateMany", "$disconnect"]
  );
});

test("zero candidates does not call updateMany", async () => {
  const prisma = mockPrisma({ candidates: [] });
  const result = await execute({ prisma });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Candidates: 0/);
  assert.match(result.stdout, /Updated: 0/);
  assert.match(result.stdout, /No update was executed/);
  assert.deepEqual(
    prisma.calls.map(([method]) => method),
    ["$connect", "findMany", "$disconnect"]
  );
});

test("old candidates clear only the six document fields", async () => {
  const prisma = mockPrisma({ candidates: [candidate()], updatedCount: 1 });
  await execute({ prisma });

  const updateArgs = prisma.calls.find(([method]) => method === "updateMany")[1];
  assert.deepEqual(updateArgs.data, {
    documentFrontBytes: null,
    documentFrontMime: null,
    documentFrontUpdatedAt: null,
    documentBackBytes: null,
    documentBackMime: null,
    documentBackUpdatedAt: null,
  });
});

test("photo fields are preserved by update data", () => {
  const data = documentRetentionClearData();

  assert.equal("photoBytes" in data, false);
  assert.equal("photoMime" in data, false);
  assert.equal("photoUpdatedAt" in data, false);
});

test("registration fields are not present in update data", () => {
  const data = documentRetentionClearData();

  for (const field of ["id", "name", "cpf", "phone", "company", "createdAt", "createdById", "createdInBranchId"]) {
    assert.equal(field in data, false);
  }
});

test("history and visits are not touched in update data", () => {
  const data = documentRetentionClearData();

  assert.equal("visits" in data, false);
  assert.equal("history" in data, false);
});

test("updateMany filter revalidates bytes, timestamps, and cutoff", async () => {
  const prisma = mockPrisma({ candidates: [candidate()], updatedCount: 1 });
  await execute({ prisma });

  const updateArgs = prisma.calls.find(([method]) => method === "updateMany")[1];
  assert.deepEqual(updateArgs.where, {
    documentFrontBytes: { not: null },
    documentBackBytes: { not: null },
    documentFrontUpdatedAt: { not: null, lte: cutoff },
    documentBackUpdatedAt: { not: null, lte: cutoff },
  });
});

test("old front and recent back is not selected by update filter", () => {
  const args = updateExpiredDocumentsArgs(cutoff);

  assert.deepEqual(args.where.documentFrontUpdatedAt, { not: null, lte: cutoff });
  assert.deepEqual(args.where.documentBackUpdatedAt, { not: null, lte: cutoff });
});

test("recent front and old back is not selected by update filter", () => {
  const args = updateExpiredDocumentsArgs(cutoff);

  assert.deepEqual(args.where.documentFrontUpdatedAt, { not: null, lte: cutoff });
  assert.deepEqual(args.where.documentBackUpdatedAt, { not: null, lte: cutoff });
});

test("already absent documents are not updated", () => {
  const args = updateExpiredDocumentsArgs(cutoff);

  assert.deepEqual(args.where.documentFrontBytes, { not: null });
  assert.deepEqual(args.where.documentBackBytes, { not: null });
});

test("repeated execution is idempotent when candidates are already cleared", async () => {
  const first = mockPrisma({ candidates: [candidate()], updatedCount: 1 });
  const second = mockPrisma({ candidates: [], updatedCount: 0 });

  const firstResult = await execute({ prisma: first });
  const secondResult = await execute({ prisma: second });

  assert.equal(firstResult.exitCode, 0);
  assert.equal(secondResult.exitCode, 0);
  assert.equal(second.calls.some(([method]) => method === "updateMany"), false);
});

test("updated count is printed", async () => {
  const result = await execute({ prisma: mockPrisma({ candidates: [candidate()], updatedCount: 1 }) });

  assert.match(result.stdout, /Updated: 1/);
});

test("candidate/update count difference is reported as possible concurrency", async () => {
  const result = await execute({ prisma: mockPrisma({ candidates: [candidate(), candidate({ id: 124 })], updatedCount: 1 }) });

  assert.match(result.stdout, /records may have changed between read and write/);
});

test("--details does not print PII", async () => {
  const result = await execute({
    argv: [confirmation, "--details"],
    prisma: mockPrisma({ candidates: [candidate()], updatedCount: 1 }),
  });

  assert.match(result.stdout, /Visitor 123 \| branch 1/);
  assert.doesNotMatch(result.stdout, /cpf|name|phone|company|documentFrontBytes|documentBackBytes|image\/jpeg/i);
});

test("findMany does not select bytes", async () => {
  const prisma = mockPrisma({ candidates: [candidate()], updatedCount: 1 });
  await execute({ prisma });

  const findArgs = prisma.calls.find(([method]) => method === "findMany")[1];
  assert.equal("documentFrontBytes" in findArgs.select, false);
  assert.equal("documentBackBytes" in findArgs.select, false);
});

test("Prisma disconnects after success", async () => {
  const prisma = mockPrisma({ candidates: [] });
  await execute({ prisma });

  assert.equal(prisma.calls.at(-1)[0], "$disconnect");
});

test("Prisma disconnects after update error", async () => {
  const prisma = mockPrisma({ candidates: [candidate()], updateError: new Error("update failed") });
  const result = await execute({ prisma });

  assert.equal(result.exitCode, 1);
  assert.equal(prisma.calls.at(-1)[0], "$disconnect");
  assert.match(result.stderr, /update failed/);
});

test("Prisma disconnects after connect error", async () => {
  const prisma = mockPrisma({ connectError: new Error("connect failed") });
  const result = await execute({ prisma });

  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    prisma.calls.map(([method]) => method),
    ["$connect", "$disconnect"]
  );
  assert.match(result.stderr, /connect failed/);
});

test("database update error returns non-zero exit code and redacts DATABASE_URL", async () => {
  const databaseUrl = "postgresql://user:secret@localhost:5432/db";
  const prisma = mockPrisma({ candidates: [candidate()], updateError: new Error(`cannot update ${databaseUrl}`) });
  const result = await execute({ env: { NODE_ENV: "production", DATABASE_URL: databaseUrl }, prisma });

  assert.equal(result.exitCode, 1);
  assert.doesNotMatch(result.stderr, /secret|postgresql:\/\/user/);
});
