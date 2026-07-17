import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcrypt";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { normalizeErrorResponses, notFoundHandler, errorHandler } from "../middlewares/errorHandler.js";
import { login } from "./auth.controller.js";
import { listBranches } from "./branches.controller.js";
import { listHistory } from "./history.controller.js";
import {
  listEvents,
  listPublicTvNowEvents,
  createEvent,
  updateEvent,
} from "./agenda.controller.js";
import {
  listUsers,
  createUser,
  updateUser,
  disableUser,
} from "./users.controller.js";

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

function withBcryptHashMock(replacement, fn) {
  const originalHash = bcryptjs.hash;
  bcryptjs.hash = replacement;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      bcryptjs.hash = originalHash;
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

test("agenda list success still returns the array directly", async () => {
  const events = [{ id: 1, visitorName: "Maria", branchId: 2 }];

  const response = await withPrismaMocks(
    {
      agendaEvent: {
        findMany: async () => events,
      },
    },
    () =>
      request((app) => app.get("/test", listEvents), {
        path: "/test?date=2099-01-01",
      })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, events);
});

test("agenda create success keeps the 201 event response", async () => {
  const event = { id: 9, visitorName: "Maria", status: "AGENDADO" };

  const response = await withPrismaMocks(
    {
      agendaEvent: {
        create: async () => event,
      },
    },
    () =>
      request((app) => app.post("/test", createEvent), {
        method: "POST",
        body: {
          visitorName: "Maria Silva",
          company: "Dimebras",
          eventWith: "Carlos",
          department: "Compras",
          eventDateTime: "2099-01-01T10:00:00.000Z",
        },
      })
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, event);
});

test("agenda Zod validation is normalized by the global error handler", async () => {
  let createCalled = false;
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        agendaEvent: {
          create: async () => {
            createCalled = true;
            return {};
          },
        },
      },
      () =>
        request((app) => app.post("/test", createEvent), {
          method: "POST",
          body: {
            visitorName: "M",
            company: "Dimebras",
            eventWith: "Carlos",
            department: "Compras",
            eventDateTime: "invalid-date",
            extra: true,
          },
        })
    )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Dados inválidos.");
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(Array.isArray(response.body.details), true);
  assert.equal("issues" in response.body, false);
  assert.equal(createCalled, false);
});

test("agenda operational 404 remains preserved", async () => {
  const response = await withPrismaMocks(
    {
      agendaEvent: {
        findFirst: async () => null,
      },
    },
    () =>
      request((app) => app.put("/test/:id", updateEvent), {
        method: "PUT",
        path: "/test/99",
        body: {
          visitorName: "Maria Silva",
          company: "Dimebras",
          eventWith: "Carlos",
          department: "Compras",
          eventDateTime: "2099-01-01T10:00:00.000Z",
        },
      })
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    message: "Agendamento não encontrado.",
    code: "AGENDA_EVENT_NOT_FOUND",
    details: null,
  });
});

test("agenda Prisma failure returns the safe global 500 without stack", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        agendaEvent: {
          findMany: async () => {
            throw new Error("select * from agendaEvent with stack details");
          },
        },
      },
      () => request((app) => app.get("/test", listEvents))
    )
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
  assert.equal(JSON.stringify(response.body).includes("select"), false);
});

test("agenda public route preserves operational branch validation", async () => {
  const response = await request((app) => app.get("/test", listPublicTvNowEvents));

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    message: "Filial obrigatória para exibição da TV.",
    code: "BAD_REQUEST",
    details: null,
  });
});

test("users list success returns safe users without passwordHash", async () => {
  const users = [
    {
      id: 1,
      username: "admin",
      role: "ADMIN",
      branchId: 1,
      isActive: true,
      createdAt: "2099-01-01T00:00:00.000Z",
      branch: { name: "Dimebras SP" },
    },
  ];

  const response = await withPrismaMocks(
    {
      user: {
        findMany: async () => users,
      },
    },
    () => request((app) => app.get("/test", listUsers))
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, users);
  assert.equal(JSON.stringify(response.body).includes("passwordHash"), false);
});

test("users create success keeps the 201 safe user response", async () => {
  const user = {
    id: 8,
    username: "novo",
    role: "RECEPCAO",
    branchId: 2,
    isActive: true,
    branch: { name: "Dimebras SP" },
  };

  const response = await withBcryptHashMock(
    async () => "hashed-password",
    () =>
      withPrismaMocks(
        {
          user: {
            findUnique: async () => null,
            create: async () => user,
          },
          branch: {
            findUnique: async () => ({ id: 2 }),
          },
        },
        () =>
          request((app) => app.post("/test", createUser), {
            method: "POST",
            body: {
              username: "novo",
              password: "123456",
              role: "RECEPCAO",
              branchId: 2,
            },
          })
      )
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, user);
  assert.equal(JSON.stringify(response.body).includes("passwordHash"), false);
});

test("users username conflict remains an operational error", async () => {
  const response = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ id: 8, username: "novo" }),
      },
    },
    () =>
      request((app) => app.post("/test", createUser), {
        method: "POST",
        body: {
          username: "novo",
          password: "123456",
          role: "RECEPCAO",
          branchId: 2,
        },
      })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    message: "Usuário já existe",
    code: "USER_USERNAME_CONFLICT",
    details: null,
  });
});

test("users ADMIN id=1 protection remains operational", async () => {
  const response = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ id: 1, username: "admin" }),
      },
    },
    () =>
      request((app) => app.put("/test/:id", updateUser), {
        method: "PUT",
        path: "/test/1",
        body: { username: "admin2" },
      })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    message: "No ADMIN (id=1) só é permitido alterar a senha",
    code: "BAD_REQUEST",
    details: null,
  });
});

test("users self-disable protection remains operational", async () => {
  const response = await request((app) => app.patch("/test/:id", disableUser), {
    method: "PATCH",
    path: "/test/7",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    message: "Você não pode desativar seu próprio usuário",
    code: "BAD_REQUEST",
    details: null,
  });
});

test("users Zod validation is normalized by the global error handler", async () => {
  let findUniqueCalled = false;
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => {
            findUniqueCalled = true;
            return null;
          },
        },
      },
      () =>
        request((app) => app.post("/test", createUser), {
          method: "POST",
          body: {
            username: "ab",
            password: "123",
            branchId: "2",
          },
        })
    )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Dados inválidos.");
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(Array.isArray(response.body.details), true);
  assert.equal("issues" in response.body, false);
  assert.equal(findUniqueCalled, false);
});

test("users bcrypt failure returns the safe global 500", async () => {
  const response = await withSilencedApiLogs(() =>
    withBcryptHashMock(
      async () => {
        throw new Error("bcrypt hash failed with stack");
      },
      () =>
        withPrismaMocks(
          {
            user: {
              findUnique: async () => null,
            },
            branch: {
              findUnique: async () => ({ id: 2 }),
            },
          },
          () =>
            request((app) => app.post("/test", createUser), {
              method: "POST",
              body: {
                username: "novo",
                password: "123456",
                role: "RECEPCAO",
                branchId: 2,
              },
            })
        )
    )
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.message, "Erro interno");
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.equal(response.body.details, null);
});

test("users Prisma failure returns the safe global 500 without stack or passwordHash", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        user: {
          findMany: async () => {
            throw new Error("select passwordHash from users with stack");
          },
        },
      },
      () => request((app) => app.get("/test", listUsers))
    )
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
  assert.equal(JSON.stringify(response.body).includes("passwordHash"), false);
});
