import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateQuery,
  documentRetentionCutoff,
  formatOutput,
  isDocumentRetentionCandidate,
  runDocumentRetentionDryRun,
} from "./dry-run-document-retention.js";

const cutoff = new Date("2026-02-03T12:00:00.000Z");
const now = new Date("2026-08-03T12:00:00.000Z");

function visitor(overrides = {}) {
  return {
    id: 123,
    documentFrontBytes: Buffer.from("front"),
    documentBackBytes: Buffer.from("back"),
    documentFrontUpdatedAt: new Date("2025-12-01T10:00:00.000Z"),
    documentBackUpdatedAt: new Date("2025-12-02T10:00:00.000Z"),
    photoBytes: null,
    visits: [],
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

function mockPrisma({ candidates = [], connectError, findError, disconnectError } = {}) {
  const calls = [];
  const writeMethods = ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"];
  const visitorModel = {
    findMany: async (args) => {
      calls.push(["findMany", args]);
      if (findError) throw findError;
      return candidates;
    },
  };

  for (const method of writeMethods) {
    visitorModel[method] = async () => {
      calls.push([method]);
      throw new Error(`${method} must not be called`);
    };
  }

  return {
    calls,
    visitor: visitorModel,
    $connect: async () => {
      calls.push(["$connect"]);
      if (connectError) throw connectError;
    },
    $disconnect: async () => {
      calls.push(["$disconnect"]);
      if (disconnectError) throw disconnectError;
    },
  };
}

test("cutoff subtracts 6 calendar months in a common month", () => {
  assert.equal(documentRetentionCutoff(new Date("2026-08-03T12:34:56.789Z")).toISOString(), "2026-02-03T12:34:56.789Z");
});

test("cutoff clamps August 31 minus 6 months to the last day of February", () => {
  assert.equal(documentRetentionCutoff(new Date("2026-08-31T08:00:00.000Z")).toISOString(), "2026-02-28T08:00:00.000Z");
});

test("cutoff keeps leap-year February 29 when clamping from August 31", () => {
  assert.equal(documentRetentionCutoff(new Date("2024-08-31T08:00:00.000Z")).toISOString(), "2024-02-29T08:00:00.000Z");
});

test("front and back old is a candidate", () => {
  assert.equal(isDocumentRetentionCandidate(visitor(), cutoff), true);
});

test("old front and recent back is not a candidate", () => {
  assert.equal(
    isDocumentRetentionCandidate(visitor({ documentBackUpdatedAt: new Date("2026-03-01T00:00:00.000Z") }), cutoff),
    false
  );
});

test("recent front and old back is not a candidate", () => {
  assert.equal(
    isDocumentRetentionCandidate(visitor({ documentFrontUpdatedAt: new Date("2026-03-01T00:00:00.000Z") }), cutoff),
    false
  );
});

test("only front existing is not a candidate", () => {
  assert.equal(isDocumentRetentionCandidate(visitor({ documentBackBytes: null }), cutoff), false);
});

test("only back existing is not a candidate", () => {
  assert.equal(isDocumentRetentionCandidate(visitor({ documentFrontBytes: null }), cutoff), false);
});

test("both documents absent is not a candidate", () => {
  assert.equal(isDocumentRetentionCandidate(visitor({ documentFrontBytes: null, documentBackBytes: null }), cutoff), false);
});

test("missing timestamp is not a candidate", () => {
  assert.equal(isDocumentRetentionCandidate(visitor({ documentFrontUpdatedAt: null }), cutoff), false);
});

test("visitor photo does not affect document retention candidacy", () => {
  assert.equal(isDocumentRetentionCandidate(visitor({ photoBytes: Buffer.from("photo") }), cutoff), true);
});

test("associated visits do not affect document retention candidacy", () => {
  assert.equal(isDocumentRetentionCandidate(visitor({ visits: [{ id: 10 }] }), cutoff), true);
});

test("query selects only safe fields and never selects document bytes", () => {
  const query = candidateQuery(cutoff);
  assert.deepEqual(query.where, {
    documentFrontBytes: { not: null },
    documentBackBytes: { not: null },
    documentFrontUpdatedAt: { lte: cutoff },
    documentBackUpdatedAt: { lte: cutoff },
  });
  assert.deepEqual(query.select, {
    id: true,
    documentFrontUpdatedAt: true,
    documentBackUpdatedAt: true,
    createdInBranchId: true,
  });
  assert.equal("documentFrontBytes" in query.select, false);
  assert.equal("documentBackBytes" in query.select, false);
  assert.equal("documentFrontMime" in query.select, false);
  assert.equal("documentBackMime" in query.select, false);
});

test("default output does not print visitor IDs", () => {
  const text = formatOutput({
    cutoff,
    now,
    details: false,
    candidates: [{ id: 123, documentFrontUpdatedAt: cutoff, documentBackUpdatedAt: cutoff, createdInBranchId: 1 }],
  });

  assert.match(text, /Candidates: 1/);
  assert.doesNotMatch(text, /Visitor 123/);
});

test("--details prints only the permitted candidate fields", () => {
  const text = formatOutput({
    cutoff,
    now,
    details: true,
    candidates: [{ id: 123, documentFrontUpdatedAt: cutoff, documentBackUpdatedAt: cutoff, createdInBranchId: 1 }],
  });

  assert.match(text, /Visitor 123 \| branch 1 \| front 2026-02-03T12:00:00.000Z \| back 2026-02-03T12:00:00.000Z/);
  assert.doesNotMatch(text, /cpf|name|phone|company|documentFrontBytes|documentBackBytes|image\/jpeg/i);
  assert.match(text, /DRY-RUN: nenhum dado foi alterado\.$/);
});

test("dry-run never calls write operations", async () => {
  const prisma = mockPrisma({ candidates: [] });
  const stdout = outputBuffer();
  const stderr = outputBuffer();

  const exitCode = await runDocumentRetentionDryRun({
    argv: [],
    env: { NODE_ENV: "test", DATABASE_URL: "postgresql://user:pass@localhost:5432/db" },
    now,
    prisma,
    stdout: stdout.stream,
    stderr: stderr.stream,
    loadEnv: () => {},
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    prisma.calls.map(([method]) => method),
    ["$connect", "findMany", "$disconnect"]
  );
});

test("Prisma disconnects after success", async () => {
  const prisma = mockPrisma({ candidates: [] });
  const stdout = outputBuffer();
  const stderr = outputBuffer();

  await runDocumentRetentionDryRun({
    env: { NODE_ENV: "test", DATABASE_URL: "postgresql://user:pass@localhost:5432/db" },
    prisma,
    stdout: stdout.stream,
    stderr: stderr.stream,
    loadEnv: () => {},
  });

  assert.equal(prisma.calls.at(-1)[0], "$disconnect");
});

test("Prisma disconnects after error", async () => {
  const prisma = mockPrisma({ findError: new Error("schema missing") });
  const stdout = outputBuffer();
  const stderr = outputBuffer();

  const exitCode = await runDocumentRetentionDryRun({
    env: { NODE_ENV: "test", DATABASE_URL: "postgresql://user:pass@localhost:5432/db" },
    prisma,
    stdout: stdout.stream,
    stderr: stderr.stream,
    loadEnv: () => {},
  });

  assert.equal(exitCode, 1);
  assert.equal(prisma.calls.at(-1)[0], "$disconnect");
  assert.match(stderr.text(), /schema missing/);
});

test("database error returns non-zero exit code and redacts DATABASE_URL", async () => {
  const databaseUrl = "postgresql://user:secret@localhost:5432/db";
  const prisma = mockPrisma({ connectError: new Error(`cannot connect to ${databaseUrl}`) });
  const stdout = outputBuffer();
  const stderr = outputBuffer();

  const exitCode = await runDocumentRetentionDryRun({
    env: { NODE_ENV: "test", DATABASE_URL: databaseUrl },
    prisma,
    stdout: stdout.stream,
    stderr: stderr.stream,
    loadEnv: () => {},
  });

  assert.equal(exitCode, 1);
  assert.doesNotMatch(stderr.text(), /secret|postgresql:\/\/user/);
});
