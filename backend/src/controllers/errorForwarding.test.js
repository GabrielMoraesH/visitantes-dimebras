import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { normalizeErrorResponses, notFoundHandler, errorHandler } from "../middlewares/errorHandler.js";
import { login } from "./auth.controller.js";
import { listBranches } from "./branches.controller.js";
import { listHistory } from "./history.controller.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const activeUser = {
  id: 7,
  username: "recepcao",
  passwordHash: "stored-hash",
  role: "RECEPCAO",
  branchId: 3,
  isActive: true,
  branch: { id: 3, name: "Dimebras SP" },
};

function withPrismaMocks(mocks, fn) {
  const originals = [];

  for (const [model, methods] of Object.entries(mocks)) {
    for (const [method, replacement] of Object.entries(methods)) {
      originals.push([model, method, prisma[model][method]]);
      prisma[model][method] = replacement;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [model, method, original] of originals.reverse()) {
        prisma[model][method] = original;
      }
    });
}

function withBcryptCompareMock(replacement, fn) {
  const originalCompare = bcrypt.compare;
  bcrypt.compare = replacement;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      bcrypt.compare = originalCompare;
    });
}

function withJwtSignMock(replacement, fn) {
  const originalSign = jwt.sign;
  jwt.sign = replacement;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      jwt.sign = originalSign;
    });
}

function withSilencedApiLogs(fn) {
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = originalError;
      console.warn = originalWarn;
    });
}

async function request(route, options = {}) {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  app.use((req, res, next) => {
    req.user = { id: 7, role: "ADMIN", branchId: 2 };
    next();
  });
  route(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${options.path || "/test"}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("branches success still returns the array directly", async () => {
  const branches = [{ id: 1, name: "Dimebras PR" }];

  const response = await withPrismaMocks(
    {
      branch: {
        findMany: async () => branches,
      },
    },
    () => request((app) => app.get("/test", listBranches))
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, branches);
});

test("branches technical error is normalized by the global error handler", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        branch: {
          findMany: async () => {
            throw new Error("database offline with stack details");
          },
        },
      },
      () => request((app) => app.get("/test", listBranches))
    )
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
  assert.equal(JSON.stringify(response.body).includes("database offline"), false);
});

test("history invalid query remains a 400 validation error with details", async () => {
  let countCalled = false;
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          count: async () => {
            countCalled = true;
            return 0;
          },
          findMany: async () => [],
        },
      },
      () =>
        request((app) => app.get("/test", listHistory), {
          path: "/test?page=-1&limit=1000",
        })
    )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(Array.isArray(response.body.details), true);
  assert.equal(response.body.details.some((detail) => detail.field === "page"), true);
  assert.equal(countCalled, false);
});

test("history technical Prisma error is returned as a safe global 500", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          count: async () => {
            throw new Error("select * from visits");
          },
          findMany: async () => [],
        },
      },
      () => request((app) => app.get("/test", listHistory))
    )
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.message, "Erro interno");
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.equal(response.body.details, null);
  assert.equal(JSON.stringify(response.body).includes("select"), false);
});

test("history success keeps pagination and JSON shape", async () => {
  const items = [{ id: 11, branchName: "Dimebras PR" }];

  const response = await withPrismaMocks(
    {
      visit: {
        count: async () => 1,
        findMany: async () => items,
      },
    },
    () => request((app) => app.get("/test", listHistory))
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    items,
    page: "1",
    limit: 25,
    total: 1,
    totalPages: 1,
  });
});

test("auth invalid credentials remain a 401 with stable code", async () => {
  const response = await withPrismaMocks(
    {
      user: {
        findUnique: async () => null,
      },
    },
    () =>
      request((app) => app.post("/test", login), {
        method: "POST",
        body: { username: "recepcao", password: "123456" },
      })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    message: "Usuário ou senha inválidos",
    code: "INVALID_CREDENTIALS",
    details: null,
  });
});

test("auth invalid input remains a 400 validation error", async () => {
  let findUniqueCalled = false;
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => {
            findUniqueCalled = true;
            return activeUser;
          },
        },
      },
      () =>
        request((app) => app.post("/test", login), {
          method: "POST",
          body: { username: "ab", password: "123456", extra: true },
        })
    )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(Array.isArray(response.body.details), true);
  assert.equal(findUniqueCalled, false);
});

test("auth Prisma failure returns the safe global 500", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => {
            throw new Error("database unavailable");
          },
        },
      },
      () =>
        request((app) => app.post("/test", login), {
          method: "POST",
          body: { username: "recepcao", password: "123456" },
        })
    )
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.message, "Erro interno");
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.equal(response.body.details, null);
});

test("auth bcrypt failure returns the safe global 500", async () => {
  const response = await withSilencedApiLogs(() =>
    withBcryptCompareMock(
      async () => {
        throw new Error("bcrypt failed");
      },
      () =>
        withPrismaMocks(
          {
            user: {
              findUnique: async () => activeUser,
            },
          },
          () =>
            request((app) => app.post("/test", login), {
              method: "POST",
              body: { username: "recepcao", password: "123456" },
            })
        )
    )
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.message, "Erro interno");
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.equal(response.body.details, null);
});

test("auth JWT failure returns the safe global 500", async () => {
  const response = await withSilencedApiLogs(() =>
    withBcryptCompareMock(
      async () => true,
      () =>
        withJwtSignMock(
          () => {
            throw new Error("jwt failed");
          },
          () =>
            withPrismaMocks(
              {
                user: {
                  findUnique: async () => activeUser,
                },
              },
              () =>
                request((app) => app.post("/test", login), {
                  method: "POST",
                  body: { username: "recepcao", password: "123456" },
                })
            )
        )
    )
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.message, "Erro interno");
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.equal(response.body.details, null);
});

test("auth success keeps token and user response shape", async () => {
  const response = await withBcryptCompareMock(
    async () => true,
    () =>
      withJwtSignMock(
        () => "signed-token",
        () =>
          withPrismaMocks(
            {
              user: {
                findUnique: async () => activeUser,
              },
            },
            () =>
              request((app) => app.post("/test", login), {
                method: "POST",
                body: { username: "recepcao", password: "123456" },
              })
          )
      )
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    token: "signed-token",
    user: {
      id: 7,
      username: "recepcao",
      role: "RECEPCAO",
      branch: { id: 3, name: "Dimebras SP" },
    },
  });
});
