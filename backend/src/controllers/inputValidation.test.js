import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import prisma from "../lib/prisma.js";
import { normalizeErrorResponses, notFoundHandler, errorHandler } from "../middlewares/errorHandler.js";
import { createVisitor, updateVisitor } from "./visitors.controller.js";
import { checkin } from "./visits.controller.js";
import { createUser } from "./users.controller.js";
import { listHistory } from "./history.controller.js";
import { updateTvContent } from "./tvContent.controller.js";

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
      method: options.method || "POST",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("visitor creation rejects unknown/protected fields before Prisma", async () => {
  let createCalled = false;

  const response = await withPrismaMocks(
    {
      visitor: {
        create: async () => {
          createCalled = true;
          return {};
        },
      },
    },
    () =>
      request(
        (app) => app.post("/test", createVisitor),
        {
          body: {
            name: "Visitante Teste",
            cpf: "12345678901",
            phone: "45999999999",
            company: "Empresa",
            role: "ADMIN",
            createdById: 1,
          },
        }
      )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(createCalled, false);
});

test("visitor creation rejects binary fields in JSON body", async () => {
  let createCalled = false;

  const response = await withPrismaMocks(
    {
      visitor: {
        create: async () => {
          createCalled = true;
          return {};
        },
      },
    },
    () =>
      request(
        (app) => app.post("/test", createVisitor),
        {
          body: {
            name: "Visitante Teste",
            cpf: "12345678901",
            photo: "base64",
          },
        }
      )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(createCalled, false);
});

test("malformed CPF is rejected before Prisma", async () => {
  let createCalled = false;

  const response = await withPrismaMocks(
    {
      visitor: {
        create: async () => {
          createCalled = true;
          return {};
        },
      },
    },
    () =>
      request((app) => app.post("/test", createVisitor), {
        body: { name: "Visitante Teste", cpf: "11111111111" },
      })
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(createCalled, false);
});

test("invalid visitor ID is rejected before Prisma lookup", async () => {
  let findCalled = false;

  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => {
          findCalled = true;
          return null;
        },
      },
    },
    () =>
      request((app) => app.put("/test/:id", updateVisitor), {
        method: "PUT",
        path: "/test/12abc",
        body: { company: "Nova" },
      })
  );

  assert.equal(response.status, 400);
  assert.equal(findCalled, false);
});

test("checkin rejects protected branchId and does not create visit", async () => {
  let created = false;

  const response = await withPrismaMocks(
    {
      visit: {
        create: async () => {
          created = true;
          return {};
        },
      },
    },
    () =>
      request((app) => app.post("/test", checkin), {
        body: {
          visitorId: 55,
          branchId: 999,
          areaToVisit: "Recepcao",
          attendedBy: "Maria",
          serviceType: "Reuniao",
        },
      })
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(created, false);
});

test("user creation rejects object username, long password and invalid enum", async () => {
  for (const body of [
    { username: { value: "admin" }, password: "123456", role: "ADMIN", branchId: 1 },
    { username: "admin2", password: "x".repeat(129), role: "ADMIN", branchId: 1 },
    { username: "admin2", password: "123456", role: "ADMINISTRADOR", branchId: 1 },
  ]) {
    const response = await request((app) => app.post("/test", createUser), { body });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
  }
});

test("history rejects negative pagination and excessive limit before Prisma", async () => {
  let countCalled = false;

  const negative = await withPrismaMocks(
    {
      visit: {
        count: async () => {
          countCalled = true;
          return 0;
        },
      },
    },
    () =>
      request((app) => app.get("/test", listHistory), {
        method: "GET",
        path: "/test?page=-1&limit=10",
        body: undefined,
      })
  );

  assert.equal(negative.status, 400);
  assert.equal(countCalled, false);

  const excessive = await request((app) => app.get("/test", listHistory), {
    method: "GET",
    path: "/test?page=1&limit=1000",
    body: undefined,
  });

  assert.equal(excessive.status, 400);
});

test("TV update parses string false as false and uses explicit update fields", async () => {
  let updateData;
  const originalFindUnique = prisma.tvContent.findUnique;
  const originalTransaction = prisma.$transaction;

  prisma.tvContent.findUnique = async () => ({ id: 10, isActive: true, branches: [] });
  prisma.$transaction = async (callback) =>
    callback({
      tvContent: {
        update: async (args) => {
          updateData = args.data;
        },
        findUnique: async () => ({ id: 10, isActive: false, branches: [] }),
      },
      tvContentBranch: {
        deleteMany: async () => {},
        createMany: async () => {},
      },
      branch: {
        findMany: async () => [],
      },
    });

  let response;
  try {
    response = await request((app) => app.put("/test/:id", updateTvContent), {
      method: "PUT",
      path: "/test/10",
      body: { isActive: "false" },
    });
  } finally {
    prisma.tvContent.findUnique = originalFindUnique;
    prisma.$transaction = originalTransaction;
  }

  assert.equal(response.status, 200);
  assert.deepEqual(updateData, { isActive: false });
});
