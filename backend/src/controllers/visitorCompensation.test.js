import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/prisma.js";
import { deleteIncompleteVisitorFromCurrentAttempt } from "./visitors.controller.js";

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function compensationReq(id = "10") {
  return {
    params: { id },
    user: { id: 7, role: "RECEPCAO", branchId: 2 },
  };
}

async function withDeleteManyMock(mock, fn) {
  const original = prisma.visitor.deleteMany;
  prisma.visitor.deleteMany = mock;

  try {
    await fn();
  } finally {
    prisma.visitor.deleteMany = original;
  }
}

async function runCompensation({ count = 1, id = "10" } = {}) {
  const req = compensationReq(id);
  const res = createRes();
  let where;

  await withDeleteManyMock(
    async (args) => {
      where = args.where;
      return { count };
    },
    () => deleteIncompleteVisitorFromCurrentAttempt(req, res)
  );

  return { res, where };
}

test("compensation removes recently created incomplete visitor from same user and branch", async () => {
  const { res, where } = await runCompensation({ count: 1 });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(where.id, 10);
  assert.equal(where.createdById, 7);
  assert.equal(where.createdInBranchId, 2);
  assert.deepEqual(where.photoBytes, null);
  assert.deepEqual(where.documentFrontBytes, null);
  assert.deepEqual(where.documentBackBytes, null);
  assert.deepEqual(where.visits, { none: {} });
  assert.ok(where.createdAt.gte instanceof Date);
});

test("compensation does not remove visitor from another user", async () => {
  const { res, where } = await runCompensation({ count: 0 });

  assert.equal(where.createdById, 7);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Visitante nao encontrado");
});

test("compensation does not remove visitor from another branch", async () => {
  const { res, where } = await runCompensation({ count: 0 });

  assert.equal(where.createdInBranchId, 2);
  assert.equal(res.statusCode, 404);
});

test("compensation does not remove visitor with photo", async () => {
  const { res, where } = await runCompensation({ count: 0 });

  assert.equal(where.photoBytes, null);
  assert.equal(res.statusCode, 404);
});

test("compensation does not remove visitor with front document", async () => {
  const { res, where } = await runCompensation({ count: 0 });

  assert.equal(where.documentFrontBytes, null);
  assert.equal(res.statusCode, 404);
});

test("compensation does not remove visitor with back document", async () => {
  const { res, where } = await runCompensation({ count: 0 });

  assert.equal(where.documentBackBytes, null);
  assert.equal(res.statusCode, 404);
});

test("compensation does not remove visitor with visits", async () => {
  const { res, where } = await runCompensation({ count: 0 });

  assert.deepEqual(where.visits, { none: {} });
  assert.equal(res.statusCode, 404);
});

test("compensation does not remove old visitor", async () => {
  const before = Date.now();
  const { res, where } = await runCompensation({ count: 0 });
  const after = Date.now();

  assert.ok(where.createdAt.gte.getTime() >= before - 15 * 60 * 1000 - 1000);
  assert.ok(where.createdAt.gte.getTime() <= after);
  assert.equal(res.statusCode, 404);
});

test("compensation returns safe response for nonexistent visitor", async () => {
  const { res } = await runCompensation({ count: 0 });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Visitante nao encontrado");
});

test("compensation returns safe response for invalid id", async () => {
  const req = compensationReq("../x");
  const res = createRes();
  let called = false;

  await withDeleteManyMock(
    async () => {
      called = true;
      return { count: 1 };
    },
    () => deleteIncompleteVisitorFromCurrentAttempt(req, res)
  );

  assert.equal(called, false);
  assert.equal(res.statusCode, 404);
});

test("two concurrent compensation calls can remove at most one visitor", async () => {
  const reqA = compensationReq("10");
  const reqB = compensationReq("10");
  const resA = createRes();
  const resB = createRes();
  let calls = 0;

  await withDeleteManyMock(
    async () => {
      calls += 1;
      return { count: calls === 1 ? 1 : 0 };
    },
    async () => {
      await Promise.all([
        deleteIncompleteVisitorFromCurrentAttempt(reqA, resA),
        deleteIncompleteVisitorFromCurrentAttempt(reqB, resB),
      ]);
    }
  );

  const statuses = [resA.statusCode, resB.statusCode].sort();
  assert.deepEqual(statuses, [200, 404]);
});

test("compensation does not remove when visit appears before conditional delete", async () => {
  const { res, where } = await runCompensation({ count: 0 });

  assert.deepEqual(where.visits, { none: {} });
  assert.equal(res.statusCode, 404);
});
