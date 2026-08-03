import test from "node:test";
import assert from "node:assert/strict";
import AuditService from "../services/audit.service.js";
import { auditRequestContext, safeAuditLog } from "./audit.js";

function withAuditMock(replacement, fn) {
  const originalLog = AuditService.log;
  AuditService.log = replacement;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      AuditService.log = originalLog;
    });
}

function withConsoleErrorMock(fn) {
  const originalError = console.error;
  const entries = [];

  console.error = (line) => entries.push(JSON.parse(line));

  return Promise.resolve()
    .then(() => fn(entries))
    .finally(() => {
      console.error = originalError;
    });
}

test("auditRequestContext extracts only safe HTTP context", () => {
  const req = {
    user: { id: 7, branchId: 2 },
    ip: "::ffff:127.0.0.1",
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    get: (name) => (name === "user-agent" ? "audit-agent" : undefined),
    headers: { authorization: "Bearer secret-token" },
  };

  const context = auditRequestContext(req);

  assert.deepEqual(context, {
    userId: 7,
    branchId: 2,
    ipAddress: "::ffff:127.0.0.1",
    userAgent: "audit-agent",
    requestId: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert.equal(JSON.stringify(context).includes("secret-token"), false);
});

test("safeAuditLog captures audit errors without unsafe payload or rejection", async () => {
  await withConsoleErrorMock((entries) =>
    withAuditMock(
      async () => {
        throw new Error("database failed with cpf 52998224725 and token secret");
      },
      async () => {
        await safeAuditLog({
          action: "LOGIN",
          entity: "AUTH",
          requestId: "123e4567-e89b-42d3-a456-426614174000",
          userId: 7,
          branchId: 2,
          metadata: { success: true },
        });

        assert.equal(entries.length, 1);
        assert.equal(entries[0].event, "audit_log_failed");
        assert.equal(entries[0].action, "LOGIN");
        assert.equal(entries[0].entity, "AUTH");
        assert.equal(entries[0].errorName, "Error");
        assert.equal(JSON.stringify(entries[0]).includes("52998224725"), false);
        assert.equal(JSON.stringify(entries[0]).includes("secret"), false);
        assert.equal(JSON.stringify(entries[0]).includes("metadata"), false);
      }
    )
  );
});
