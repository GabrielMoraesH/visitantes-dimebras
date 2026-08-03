import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import prisma from "../lib/prisma.js";
import { AuditService } from "./audit.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, "../..");

function withPrismaMocks(mocks, fn) {
  const originals = [];

  for (const [model, methods] of Object.entries(mocks)) {
    const hadModel = Object.prototype.hasOwnProperty.call(prisma, model);
    const originalModel = prisma[model];
    if (!hadModel) prisma[model] = {};

    for (const [method, replacement] of Object.entries(methods)) {
      originals.push([model, method, prisma[model][method], hadModel, originalModel]);
      prisma[model][method] = replacement;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [model, method, originalMethod, hadModel, originalModel] of originals.reverse()) {
        if (hadModel) {
          prisma[model][method] = originalMethod;
        } else {
          prisma[model] = originalModel;
          delete prisma[model];
        }
      }
    });
}

async function captureCreate(input, result = auditLogRecord(input)) {
  let createArgs;
  const output = await withPrismaMocks(
    {
      auditLog: {
        create: async (args) => {
          createArgs = args;
          return result;
        },
      },
    },
    () => AuditService.log(input)
  );

  return { createArgs, output };
}

function auditLogRecord(overrides = {}) {
  return {
    id: 1,
    createdAt: new Date("2026-08-03T12:00:00Z"),
    userId: overrides.userId ?? null,
    branchId: overrides.branchId ?? null,
    action: overrides.action ?? "LOGIN",
    entity: overrides.entity ?? "AUTH",
    entityId: overrides.entityId ?? null,
    description: overrides.description ?? null,
    metadata: overrides.metadata ?? null,
    ipAddress: overrides.ipAddress ?? null,
    userAgent: overrides.userAgent ?? null,
    requestId: overrides.requestId ?? null,
  };
}

test("creates audit log with minimal fields", async () => {
  const { createArgs } = await captureCreate({ action: "LOGIN", entity: "AUTH" });

  assert.deepEqual(createArgs.data, { action: "LOGIN", entity: "AUTH" });
  assert.equal(createArgs.select.id, true);
  assert.equal(createArgs.select.createdAt, true);
});

test("creates audit log with all fields", async () => {
  const input = {
    userId: 2,
    branchId: 3,
    action: "visitor create",
    entity: "visitor",
    entityId: 10,
    description: "Criou visitante",
    metadata: { changedFields: ["name"] },
    ipAddress: "127.0.0.1",
    userAgent: "node-test",
    requestId: "req-1",
  };

  const { createArgs } = await captureCreate(input);

  assert.deepEqual(createArgs.data, {
    ...input,
    action: "VISITOR_CREATE",
    entity: "VISITOR",
    entityId: "10",
  });
});

test("userId can be null", async () => {
  const { createArgs } = await captureCreate({ userId: null, action: "LOGIN", entity: "AUTH" });

  assert.equal(createArgs.data.userId, null);
});

test("branchId can be null", async () => {
  const { createArgs } = await captureCreate({ branchId: null, action: "LOGIN", entity: "AUTH" });

  assert.equal(createArgs.data.branchId, null);
});

test("action is required", async () => {
  await assert.rejects(AuditService.log({ entity: "AUTH" }), { name: "ZodError" });
});

test("entity is required", async () => {
  await assert.rejects(AuditService.log({ action: "LOGIN" }), { name: "ZodError" });
});

test("empty action is rejected", async () => {
  await assert.rejects(AuditService.log({ action: "   ", entity: "AUTH" }), { name: "ZodError" });
});

test("empty entity is rejected", async () => {
  await assert.rejects(AuditService.log({ action: "LOGIN", entity: "   " }), { name: "ZodError" });
});

test("string limits are enforced", async () => {
  await assert.rejects(
    AuditService.log({ action: "A".repeat(81), entity: "AUTH" }),
    /action muito longo/
  );
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", description: "D".repeat(501) }),
    /campo muito longo/
  );
});

test("simple metadata is accepted", async () => {
  const metadata = { before: "OPEN", after: "CLOSED", count: 1, ok: true, items: ["name"] };
  const { createArgs } = await captureCreate({ action: "VISIT_UPDATE", entity: "VISIT", metadata });

  assert.deepEqual(createArgs.data.metadata, metadata);
});

test("circular metadata is rejected", async () => {
  const metadata = {};
  metadata.self = metadata;

  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata }),
    /metadata circular/
  );
});

test("Buffer metadata is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { upload: Buffer.from("x") } }),
    /Buffer/
  );
});

test("BigInt metadata is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { value: 1n } }),
    /BigInt/
  );
});

test("Date metadata is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { createdAt: new Date() } }),
    /Date/
  );
});

test("function metadata is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { callback: () => {} } }),
    /funcao/
  );
});

test("password metadata key is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { password: "x" } }),
    /chave sensivel/
  );
});

test("token metadata key is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { accessToken: "x" } }),
    /chave sensivel/
  );
});

test("authorization metadata key is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { authorization: "Bearer x" } }),
    /chave sensivel/
  );
});

test("cpf metadata key is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { cpf: "12345678901" } }),
    /chave sensivel/
  );
});

test("byte metadata key is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "VISITOR_UPDATE", entity: "VISITOR", metadata: { photoBytes: "x" } }),
    /chave sensivel/
  );
});

test("excessive metadata depth is rejected", async () => {
  const metadata = { a: { b: { c: { d: { e: { f: "x" } } } } } };

  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata }),
    /profundidade excessiva/
  );
});

test("oversized metadata is rejected", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", metadata: { text: "x".repeat(9000) } }),
    /grande demais/
  );
});

test("undefined fields are not sent to Prisma", async () => {
  const { createArgs } = await captureCreate({
    action: "LOGIN",
    entity: "AUTH",
    entityId: undefined,
    metadata: undefined,
  });

  assert.deepEqual(Object.keys(createArgs.data).sort(), ["action", "entity"]);
});

test("action and entity are normalized", async () => {
  const { createArgs } = await captureCreate({ action: "tv content delete", entity: "tv content" });

  assert.equal(createArgs.data.action, "TV_CONTENT_DELETE");
  assert.equal(createArgs.data.entity, "TV_CONTENT");
});

test("Prisma create errors are propagated", async () => {
  await assert.rejects(
    withPrismaMocks(
      {
        auditLog: {
          create: async () => {
            throw new Error("database down");
          },
        },
      },
      () => AuditService.log({ action: "LOGIN", entity: "AUTH" })
    ),
    /database down/
  );
});

test("Prisma create receives only allowed fields", async () => {
  await assert.rejects(
    AuditService.log({ action: "LOGIN", entity: "AUTH", password: "x" }),
    { name: "ZodError" }
  );

  const { createArgs } = await captureCreate({ action: "LOGIN", entity: "AUTH", requestId: "r1" });
  assert.deepEqual(Object.keys(createArgs.data).sort(), ["action", "entity", "requestId"]);
});

test("AuditService exposes only log", () => {
  assert.deepEqual(Object.keys(AuditService), ["log"]);
  assert.equal(AuditService.update, undefined);
  assert.equal(AuditService.delete, undefined);
  assert.equal(AuditService.deleteMany, undefined);
});

test("response uses safe selected audit log shape", async () => {
  const record = auditLogRecord({ action: "LOGIN", entity: "AUTH" });
  const { output } = await captureCreate({ action: "LOGIN", entity: "AUTH" }, record);

  assert.deepEqual(Object.keys(output).sort(), Object.keys(record).sort());
  assert.equal(output.password, undefined);
  assert.equal(output.token, undefined);
});

test("migration creates nullable FKs with SET NULL", () => {
  const migration = readFileSync(
    resolve(backendRoot, "prisma/migrations/20260803160000_add_audit_logs/migration.sql"),
    "utf8"
  );

  assert.match(migration, /CREATE TABLE "audit_logs"/);
  assert.match(migration, /"userId" INTEGER,/);
  assert.match(migration, /"branchId" INTEGER,/);
  assert.match(migration, /REFERENCES "users"\("id"\) ON DELETE SET NULL ON UPDATE CASCADE/);
  assert.match(migration, /REFERENCES "branches"\("id"\) ON DELETE SET NULL ON UPDATE CASCADE/);
});

test("schema and migration include expected indexes", () => {
  const schema = readFileSync(resolve(backendRoot, "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    resolve(backendRoot, "prisma/migrations/20260803160000_add_audit_logs/migration.sql"),
    "utf8"
  );

  for (const index of [
    "@@index([createdAt])",
    "@@index([userId, createdAt])",
    "@@index([branchId, createdAt])",
    "@@index([action, createdAt])",
    "@@index([entity, entityId, createdAt])",
  ]) {
    assert.ok(schema.includes(index), index);
  }

  for (const indexName of [
    "audit_logs_createdAt_idx",
    "audit_logs_userId_createdAt_idx",
    "audit_logs_branchId_createdAt_idx",
    "audit_logs_action_createdAt_idx",
    "audit_logs_entity_entityId_createdAt_idx",
  ]) {
    assert.ok(migration.includes(indexName), indexName);
  }
});
