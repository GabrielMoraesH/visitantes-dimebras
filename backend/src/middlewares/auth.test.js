import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { auth, authorizeRoles } from "./auth.js";
import prisma from "../lib/prisma.js";
import { errorHandler } from "./errorHandler.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
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

async function runAuth(headers = {}) {
  const req = { headers, method: "GET", originalUrl: "/test" };
  const res = createRes();
  let nextCalled = false;

  await auth(req, res, (err) => {
    if (err) {
      errorHandler(err, req, res, () => {});
      return;
    }
    nextCalled = true;
  });

  return { req, res, nextCalled };
}

test("auth returns 401 when token is missing", async () => {
  const { res, nextCalled } = await runAuth();

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("auth returns 401 when token is invalid", async () => {
  const { res, nextCalled } = await runAuth({ authorization: "Bearer invalid-token" });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("auth returns 401 when token is expired", async () => {
  const token = jwt.sign({ sub: "1" }, process.env.JWT_SECRET, { expiresIn: "-1s" });
  const { res, nextCalled } = await runAuth({ authorization: `Bearer ${token}` });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("auth allows active users and exposes trusted database data", async () => {
  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => ({
    id: 7,
    username: "recepcao",
    role: "RECEPCAO",
    branchId: 2,
    isActive: true,
    branch: { name: "Filial Teste" },
  });

  try {
    const token = jwt.sign(
      { sub: "7", role: "ADMIN", branchId: 999 },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const { req, res, nextCalled } = await runAuth({ authorization: `Bearer ${token}` });

    assert.equal(res.statusCode, 200);
    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, {
      id: 7,
      username: "recepcao",
      role: "RECEPCAO",
      branchId: 2,
      branchName: "Filial Teste",
    });
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test("auth returns 401 for inactive or missing users", async () => {
  const originalFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => null;

  try {
    const token = jwt.sign({ sub: "7" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const { res, nextCalled } = await runAuth({ authorization: `Bearer ${token}` });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});

test("authorizeRoles returns 401 without authenticated user", () => {
  const req = { method: "GET", originalUrl: "/test" };
  const res = createRes();
  let nextCalled = false;

  authorizeRoles("ADMIN")(req, res, (err) => {
    if (err) {
      errorHandler(err, req, res, () => {});
      return;
    }
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("authorizeRoles returns 403 for authenticated user without permission", () => {
  const req = { user: { role: "RECEPCAO" }, method: "GET", originalUrl: "/test" };
  const res = createRes();
  let nextCalled = false;

  authorizeRoles("ADMIN")(req, res, (err) => {
    if (err) {
      errorHandler(err, req, res, () => {});
      return;
    }
    nextCalled = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("authorizeRoles allows authenticated user with permission", () => {
  const req = { user: { role: "ADMIN" } };
  const res = createRes();
  let nextCalled = false;

  authorizeRoles("ADMIN")(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 200);
  assert.equal(nextCalled, true);
});
