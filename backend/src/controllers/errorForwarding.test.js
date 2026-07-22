import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcrypt";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import multer from "multer";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { tvTempUploadDir, tvUploadDir } from "../config/uploads.js";
import { sessionJwtSignOptions } from "../config/auth.js";
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
import {
  getByCpf,
  createVisitor,
  updateVisitor,
  updateVisitorFiles,
  getVisitorPhoto,
  getVisitorDocFront,
  getVisitorDocBack,
  deleteIncompleteVisitorFromCurrentAttempt,
} from "./visitors.controller.js";
import {
  checkin,
  checkout,
  getOpenVisitsMyBranch,
  getVisitById,
  label,
  labelToken,
  openByCpf,
  recentByCpf,
  statsByCpf,
} from "./visits.controller.js";
import {
  createTvContent,
  deleteTvContent,
  handleTvUploadErrors,
  listActiveTvContents,
  listPublicActiveTvContents,
  listTvContents,
  toggleTvContent,
  tvUpload,
  updateTvContent,
} from "./tvContent.controller.js";

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

const visitorCpf = "52998224725";
const visitorFileBytes = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);
const tvPngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

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

function withQRCodeToDataURLMock(replacement, fn) {
  const originalToDataURL = QRCode.toDataURL;
  QRCode.toDataURL = replacement;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      QRCode.toDataURL = originalToDataURL;
    });
}

function withFsMocks(mocks, fn) {
  const originals = Object.entries(mocks).map(([method, replacement]) => {
    const original = fs.promises[method];
    fs.promises[method] = replacement;
    return [method, original];
  });

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [method, original] of originals.reverse()) {
        fs.promises[method] = original;
      }
    });
}

function withTvUploadSingleMock(replacement, fn) {
  const originalSingle = tvUpload.single;
  tvUpload.single = replacement;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      tvUpload.single = originalSingle;
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

async function requestBinary(route, options = {}) {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  app.use((req, res, next) => {
    req.user = options.user || { id: 7, role: "ADMIN", branchId: 2 };
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
      headers: options.headers || {},
      body: options.body,
    });

    const contentType = response.headers.get("content-type") || "";
    const bytes = Buffer.from(await response.arrayBuffer());
    let body = null;
    if (contentType.includes("application/json") && bytes.length > 0) {
      body = JSON.parse(bytes.toString("utf8"));
    }

    return { status: response.status, headers: response.headers, bytes, body };
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

test("visitors by CPF success keeps the visitor JSON shape", async () => {
  const visitor = { id: 55, cpf: visitorCpf, name: "Maria Silva" };
  let findCalls = 0;

  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async (args) => {
          findCalls += 1;
          if (args.where?.cpf) return visitor;
          return { id: 55, createdInBranchId: 2 };
        },
      },
    },
    () =>
      request((app) => app.get("/test/:cpf", getByCpf), {
        path: `/test/${visitorCpf}`,
      })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, visitor);
  assert.equal(findCalls, 2);
});

test("visitors by CPF operational 404 remains preserved", async () => {
  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => null,
      },
    },
    () =>
      request((app) => app.get("/test/:cpf", getByCpf), {
        path: `/test/${visitorCpf}`,
      })
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    message: "Visitante não encontrado",
    code: "VISITOR_NOT_FOUND",
    details: null,
  });
});

test("visitors by CPF Zod validation is normalized globally", async () => {
  let findCalled = false;
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            findCalled = true;
            return null;
          },
        },
      },
      () =>
        request((app) => app.get("/test/:cpf", getByCpf), {
          path: "/test/11111111111",
        })
    )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Dados inválidos.");
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(Array.isArray(response.body.details), true);
  assert.equal("issues" in response.body, false);
  assert.equal(findCalled, false);
});

test("visitors by CPF technical error is normalized globally", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            throw new Error("select cpf from visitor with stack");
          },
        },
      },
      () =>
        request((app) => app.get("/test/:cpf", getByCpf), {
          path: `/test/${visitorCpf}`,
        })
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

test("visitors create success keeps the 201 visitor response", async () => {
  const created = {
    id: 56,
    name: "Maria Silva",
    cpf: visitorCpf,
    phone: "45999999999",
    company: "Dimebras",
    createdAt: "2099-01-01T00:00:00.000Z",
  };

  const response = await withPrismaMocks(
    {
      visitor: {
        create: async () => created,
      },
    },
    () =>
      request((app) => app.post("/test", createVisitor), {
        method: "POST",
        body: {
          name: "Maria Silva",
          cpf: visitorCpf,
          phone: "45999999999",
          company: "Dimebras",
        },
      })
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, created);
});

test("visitors create CPF conflict remains friendly through global Prisma translation", async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["cpf"] },
  });

  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          create: async () => {
            throw conflict;
          },
        },
      },
      () =>
        request((app) => app.post("/test", createVisitor), {
          method: "POST",
          body: {
            name: "Maria Silva",
            cpf: visitorCpf,
            phone: "45999999999",
          },
        })
    )
  );

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    message: "CPF já cadastrado",
    code: "VISITOR_CPF_CONFLICT",
    details: null,
  });
});

test("visitors create Zod validation is normalized globally", async () => {
  let createCalled = false;
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
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
          method: "POST",
          body: {
            name: "M",
            cpf: visitorCpf,
            phone: "45999999999",
            createdById: 99,
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

test("visitors create unexpected Prisma failure returns the safe global 500", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          create: async () => {
            throw new Error("prisma visitor create failed with stack");
          },
        },
      },
      () =>
        request((app) => app.post("/test", createVisitor), {
          method: "POST",
          body: {
            name: "Maria Silva",
            cpf: visitorCpf,
            phone: "45999999999",
          },
        })
    )
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
});

test("visitors update success keeps the visitor JSON response", async () => {
  const visitor = { id: 55, phone: "45999999999", company: "Nova", updatedAt: "2099-01-01" };

  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => ({ id: 55, createdInBranchId: 2 }),
        update: async () => visitor,
      },
    },
    () =>
      request((app) => app.put("/test/:id", updateVisitor), {
        method: "PUT",
        path: "/test/55",
        body: { phone: "45999999999", company: "Nova" },
      })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, visitor);
});

test("visitors update operational 404 remains preserved", async () => {
  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => null,
      },
    },
    () =>
      request((app) => app.put("/test/:id", updateVisitor), {
        method: "PUT",
        path: "/test/55",
        body: { company: "Nova" },
      })
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    message: "Visitante não encontrado",
    code: "VISITOR_NOT_FOUND",
    details: null,
  });
});

test("visitors update technical error is normalized globally", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => ({ id: 55, createdInBranchId: 2 }),
          update: async () => {
            throw new Error("update visitor leaked stack");
          },
        },
      },
      () =>
        request((app) => app.put("/test/:id", updateVisitor), {
          method: "PUT",
          path: "/test/55",
          body: { company: "Nova" },
        })
    )
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
});

test("visitors file upload JSON success keeps the visitor response", async () => {
  const visitor = { id: 55, cpf: visitorCpf, photoUpdatedAt: "2099-01-01T00:00:00.000Z" };
  let updateData;

  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => ({ id: 55, createdInBranchId: 2 }),
        update: async (args) => {
          updateData = args.data;
          return visitor;
        },
      },
    },
    () =>
      request(
        (app) =>
          app.put(
            "/test/:id/files",
            (req, res, next) => {
              req.files = {
                photo: [{ buffer: visitorFileBytes, mimetype: "image/jpeg" }],
              };
              next();
            },
            updateVisitorFiles
          ),
        {
          method: "PUT",
          path: "/test/55/files",
          body: undefined,
        }
      )
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, visitor);
  assert.ok(updateData.photoBytes);
});

test("visitors file upload operational file validation remains preserved", async () => {
  let updateCalled = false;
  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => ({ id: 55, createdInBranchId: 2 }),
        update: async () => {
          updateCalled = true;
          return {};
        },
      },
    },
    () =>
      request(
        (app) =>
          app.put(
            "/test/:id/files",
            (req, res, next) => {
              req.files = {
                documentFront: [{ buffer: Buffer.from("not an image"), mimetype: "image/jpeg" }],
              };
              next();
            },
            updateVisitorFiles
          ),
        {
          method: "PUT",
          path: "/test/55/files",
          body: undefined,
        }
      )
  );

  assert.equal(response.status, 415);
  assert.equal(response.body.code, "UPLOAD_INVALID_TYPE");
  assert.equal(updateCalled, false);
});

test("visitors file upload unexpected error is normalized globally without stack", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            throw new Error("file access stack details");
          },
        },
      },
      () =>
        request(
          (app) =>
            app.put(
              "/test/:id/files",
              (req, res, next) => {
                req.files = {
                  photo: [{ buffer: visitorFileBytes, mimetype: "image/jpeg" }],
                };
                next();
              },
              updateVisitorFiles
            ),
          {
            method: "PUT",
            path: "/test/55/files",
            body: undefined,
          }
        )
    )
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
});

function assertVisitorFileHeaders(response, { contentType, contentLength }) {
  assert.equal(response.headers.get("content-type"), contentType);
  assert.equal(response.headers.get("content-length"), String(contentLength));
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("expires"), null);
}

const visitorFileEndpointCases = [
  {
    name: "photo",
    path: "/test/55/photo",
    handler: getVisitorPhoto,
    route: "/test/:id/photo",
    bytesKey: "photoBytes",
    mimeKey: "photoMime",
    mime: "image/jpeg",
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  },
  {
    name: "document front",
    path: "/test/55/doc-front",
    handler: getVisitorDocFront,
    route: "/test/:id/doc-front",
    bytesKey: "documentFrontBytes",
    mimeKey: "documentFrontMime",
    mime: "image/png",
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  },
  {
    name: "document back",
    path: "/test/55/doc-back",
    handler: getVisitorDocBack,
    route: "/test/:id/doc-back",
    bytesKey: "documentBackBytes",
    mimeKey: "documentBackMime",
    mime: "image/webp",
    bytes: Buffer.from([0x52, 0x49, 0x46, 0x46, 0x01]),
  },
];

for (const fileCase of visitorFileEndpointCases) {
  test(`visitors ${fileCase.name} binary success keeps headers and bytes`, async () => {
    let fileReadCalled = false;
    const response = await withPrismaMocks(
      {
        visitor: {
          findUnique: async (args) => {
            if (args.select?.createdInBranchId) {
              return { id: 55, createdInBranchId: 2 };
            }

            fileReadCalled = true;
            return {
              [fileCase.bytesKey]: fileCase.bytes,
              [fileCase.mimeKey]: fileCase.mime,
            };
          },
        },
      },
      () => requestBinary((app) => app.get(fileCase.route, fileCase.handler), { path: fileCase.path })
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.bytes, fileCase.bytes);
    assertVisitorFileHeaders(response, {
      contentType: fileCase.mime,
      contentLength: fileCase.bytes.length,
    });
    assert.equal(fileReadCalled, true);
  });
}

test("visitors binary missing file keeps empty 404 without file headers", async () => {
  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async (args) => {
          if (args.select?.createdInBranchId) {
            return { id: 55, createdInBranchId: 2 };
          }

          return { photoBytes: null, photoMime: null };
        },
      },
    },
    () => requestBinary((app) => app.get("/test/:id/photo", getVisitorPhoto), { path: "/test/55/photo" })
  );

  assert.equal(response.status, 404);
  assert.equal(response.bytes.length, 0);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("content-type"), null);
  assert.equal(response.headers.get("content-disposition"), null);
  assert.equal(response.headers.get("x-content-type-options"), null);
  assert.equal(response.headers.get("cache-control"), null);
  assert.equal(response.headers.get("pragma"), null);
});

test("visitors binary invalid ID keeps global JSON format and no file read", async () => {
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
    () => requestBinary((app) => app.get("/test/:id/photo", getVisitorPhoto), { path: "/test/abc/photo" })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    message: "ID inv\u00e1lido",
    code: "BAD_REQUEST",
    details: null,
  });
  assert.equal(findCalled, false);
  assert.equal(response.headers.get("content-disposition"), null);
});

test("visitors binary Prisma error before headers is normalized globally without stack", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            throw new Error("select photoBytes from visitor with stack");
          },
        },
      },
      () => requestBinary((app) => app.get("/test/:id/photo", getVisitorPhoto), { path: "/test/55/photo" })
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
  assert.equal(response.headers.get("content-disposition"), null);
});

test("visitors binary denied access keeps 404 JSON and does not send buffer", async () => {
  let fileReadCalled = false;
  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async (args) => {
          if (args.select?.createdInBranchId) {
            return { id: 55, createdInBranchId: 99 };
          }

          fileReadCalled = true;
          return { photoBytes: Buffer.from("secret"), photoMime: "image/jpeg" };
        },
      },
      visit: {
        findFirst: async () => null,
      },
    },
    () =>
      requestBinary((app) => app.get("/test/:id/photo", getVisitorPhoto), {
        path: "/test/55/photo",
        user: { id: 7, role: "RECEPCAO", branchId: 2 },
      })
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    message: "Visitante n\u00e3o encontrado.",
    code: "VISITOR_NOT_FOUND",
    details: null,
  });
  assert.equal(fileReadCalled, false);
  assert.equal(response.bytes.includes(Buffer.from("secret")), false);
  assert.equal(response.headers.get("content-disposition"), null);
});

test("visitors incomplete compensation success remains preserved", async () => {
  const response = await withPrismaMocks(
    {
      visitor: {
        deleteMany: async () => ({ count: 1 }),
      },
    },
    () =>
      request((app) => app.delete("/test/:id/incomplete-created", deleteIncompleteVisitorFromCurrentAttempt), {
        method: "DELETE",
        path: "/test/55/incomplete-created",
        body: undefined,
      })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});

test("visitors incomplete compensation safe 404 remains preserved", async () => {
  const response = await withPrismaMocks(
    {
      visitor: {
        deleteMany: async () => ({ count: 0 }),
      },
    },
    () =>
      request((app) => app.delete("/test/:id/incomplete-created", deleteIncompleteVisitorFromCurrentAttempt), {
        method: "DELETE",
        path: "/test/55/incomplete-created",
        body: undefined,
      })
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    message: "Visitante não encontrado",
    code: "VISITOR_NOT_FOUND",
    details: null,
  });
});

test("visitors incomplete compensation Prisma error is normalized globally", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          deleteMany: async () => {
            throw new Error("deleteMany failed with stack");
          },
        },
      },
      () =>
        request((app) => app.delete("/test/:id/incomplete-created", deleteIncompleteVisitorFromCurrentAttempt), {
          method: "DELETE",
          path: "/test/55/incomplete-created",
          body: undefined,
        })
    )
  );

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
});

test("tv content admin and active listings preserve success and forward Prisma failures", async () => {
  const item = {
    id: 1,
    title: "Banner",
    fileUrl: "/uploads/tv/banner.png",
    branches: [{ branch: { id: 2, name: "Filial 2" } }],
  };

  const admin = await withPrismaMocks(
    {
      tvContent: {
        findMany: async (args) => {
          assert.deepEqual(args.orderBy, [{ order: "asc" }, { createdAt: "desc" }]);
          return [item];
        },
      },
    },
    () => request((app) => app.get("/test", listTvContents))
  );

  assert.equal(admin.status, 200);
  assert.deepEqual(admin.body, [
    { id: 1, title: "Banner", fileUrl: "/uploads/tv/banner.png", branches: [{ id: 2, name: "Filial 2" }] },
  ]);

  const active = await withPrismaMocks(
    {
      tvContent: {
        findMany: async (args) => {
          assert.deepEqual(args.where, { isActive: true });
          assert.deepEqual(args.orderBy, [{ order: "asc" }, { createdAt: "asc" }]);
          return [item];
        },
      },
    },
    () => request((app) => app.get("/test", listActiveTvContents))
  );

  assert.equal(active.status, 200);
  assert.equal(active.body[0].fileUrl, "/uploads/tv/banner.png");

  const failure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        tvContent: {
          findMany: async () => {
            throw new Error("select tv content stack");
          },
        },
      },
      () => request((app) => app.get("/test", listTvContents))
    )
  );

  assert.equal(failure.status, 500);
  assert.deepEqual(failure.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(failure.body).includes("select"), false);
});

test("tv content public listing preserves operational messages, success shape and global failures", async () => {
  const missing = await request((app) => app.get("/test", listPublicActiveTvContents));
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body, {
    message: "Filial obrigatória para exibição da TV.",
    code: "BAD_REQUEST",
    details: null,
  });

  const nonexistent = await withPrismaMocks(
    {
      branch: {
        findUnique: async () => null,
      },
    },
    () => request((app) => app.get("/test", listPublicActiveTvContents), { path: "/test?branchId=99" })
  );
  assert.equal(nonexistent.status, 404);
  assert.deepEqual(nonexistent.body, {
    message: "Filial não encontrada.",
    code: "RESOURCE_NOT_FOUND",
    details: null,
  });

  const items = [{ id: 3, title: "TV", type: "IMAGE", fileUrl: "/uploads/tv/a.png", order: 1 }];
  const success = await withPrismaMocks(
    {
      branch: {
        findUnique: async (args) => {
          assert.deepEqual(args, { where: { id: 7 }, select: { id: true } });
          return { id: 7 };
        },
      },
      tvContent: {
        findMany: async (args) => {
          assert.deepEqual(args.where, { isActive: true, branches: { some: { branchId: 7 } } });
          assert.deepEqual(args.select, { id: true, title: true, type: true, fileUrl: true, order: true });
          return items;
        },
      },
    },
    () => request((app) => app.get("/test", listPublicActiveTvContents), { path: "/test?branchId=7" })
  );
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, items);

  const invalid = await withSilencedApiLogs(() =>
    request((app) => app.get("/test", listPublicActiveTvContents), { path: "/test?branchId=abc" })
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.message, "Dados inválidos.");
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
  assert.equal(Array.isArray(invalid.body.details), true);

  const failure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        branch: {
          findUnique: async () => {
            throw new Error("branch lookup failed with stack");
          },
        },
      },
      () => request((app) => app.get("/test", listPublicActiveTvContents), { path: "/test?branchId=7" })
    )
  );
  assert.equal(failure.status, 500);
  assert.equal(failure.body.code, "INTERNAL_ERROR");
});

test("tv content upload wrapper preserves known upload errors and forwards unknown technical errors", async () => {
  const large = await withTvUploadSingleMock(
    () => (req, res, cb) => cb(new multer.MulterError("LIMIT_FILE_SIZE", "file")),
    () => request((app) => app.post("/test", handleTvUploadErrors, createTvContent), { method: "POST" })
  );
  assert.equal(large.status, 413);
  assert.deepEqual(large.body, {
    message: "Arquivo excede o limite de 200MB.",
    code: "UPLOAD_FILE_TOO_LARGE",
    details: null,
  });

  const unexpected = await withTvUploadSingleMock(
    () => (req, res, cb) => cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "other")),
    () => request((app) => app.post("/test", handleTvUploadErrors, createTvContent), { method: "POST" })
  );
  assert.equal(unexpected.status, 400);
  assert.equal(unexpected.body.code, "UPLOAD_INVALID");

  const invalidTypeError = new Error("Tipo de arquivo não permitido.");
  invalidTypeError.statusCode = 415;
  const invalidType = await withTvUploadSingleMock(
    () => (req, res, cb) => cb(invalidTypeError),
    () => request((app) => app.post("/test", handleTvUploadErrors, createTvContent), { method: "POST" })
  );
  assert.equal(invalidType.status, 415);
  assert.deepEqual(invalidType.body, {
    message: "Tipo de arquivo não permitido.",
    code: "UPLOAD_INVALID_TYPE",
    details: null,
  });

  const unknown = await withSilencedApiLogs(() =>
    withTvUploadSingleMock(
      () => (req, res, cb) => cb(new Error("storage mkdir failed with absolute path C:\\secret")),
      () => request((app) => app.post("/test", handleTvUploadErrors, createTvContent), { method: "POST" })
    )
  );
  assert.equal(unknown.status, 500);
  assert.deepEqual(unknown.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(unknown.body).includes("secret"), false);
});

test("tv content create preserves 201, missing file contract and forwards service errors without duplicate cleanup", async () => {
  const missingFile = await withTvUploadSingleMock(
    () => (req, res, cb) => {
      req.body = { title: "Banner", branchIds: "[1]" };
      cb();
    },
    () => withPrismaMocks(
      {
        branch: {
          findMany: async () => [{ id: 1 }],
        },
      },
      () => request((app) => app.post("/test", handleTvUploadErrors, createTvContent), { method: "POST" })
    )
  );
  assert.equal(missingFile.status, 400);
  assert.deepEqual(missingFile.body, {
    message: "Arquivo obrigatorio.",
    code: "BAD_REQUEST",
    details: null,
  });

  const tempPath = path.join(tvTempUploadDir, "controller-test.upload");
  const createdContent = {
    id: 10,
    title: "Banner",
    type: "IMAGE",
    fileUrl: "/uploads/tv/generated.png",
    branches: [{ branch: { id: 1, name: "Filial 1" } }],
  };
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) =>
    callback({
      tvContent: {
        create: async () => ({ id: 10 }),
        findUnique: async () => createdContent,
      },
      tvContentBranch: {
        createMany: async () => {},
      },
    });

  try {
    const success = await withTvUploadSingleMock(
      () => (req, res, cb) => {
        req.body = { title: "Banner", branchIds: "[1]" };
        req.file = {
          path: tempPath,
          originalname: "banner.png",
          mimetype: "image/png",
          size: tvPngBytes.length,
        };
        cb();
      },
      () =>
        withFsMocks(
          {
            open: async () => ({
              read: async (buffer) => {
                tvPngBytes.copy(buffer);
                return { bytesRead: tvPngBytes.length };
              },
              close: async () => {},
            }),
            rename: async (from, to) => {
              assert.equal(from, tempPath);
              assert.ok(to.startsWith(tvUploadDir));
            },
            unlink: async () => {
              throw new Error("controller must not cleanup on success");
            },
          },
          () =>
            withPrismaMocks(
              {
                branch: {
                  findMany: async () => [{ id: 1 }],
                },
              },
              () => request((app) => app.post("/test", handleTvUploadErrors, createTvContent), { method: "POST" })
            )
        )
    );
    assert.equal(success.status, 201);
    assert.deepEqual(success.body, {
      id: 10,
      title: "Banner",
      type: "IMAGE",
      fileUrl: "/uploads/tv/generated.png",
      branches: [{ id: 1, name: "Filial 1" }],
    });
  } finally {
    prisma.$transaction = originalTransaction;
  }

  let unlinkCalls = 0;
  const failure = await withSilencedApiLogs(() =>
    withTvUploadSingleMock(
      () => (req, res, cb) => {
        req.body = { title: "Banner", branchIds: "[1]" };
        req.file = {
          path: tempPath,
          originalname: "banner.png",
          mimetype: "image/png",
          size: tvPngBytes.length,
        };
        cb();
      },
      () =>
        withFsMocks(
          {
            open: async () => ({
              read: async (buffer) => {
                tvPngBytes.copy(buffer);
                return { bytesRead: tvPngBytes.length };
              },
              close: async () => {},
            }),
            rename: async () => {},
            unlink: async () => {
              unlinkCalls += 1;
            },
          },
          async () => {
            const original = prisma.$transaction;
            prisma.$transaction = async () => {
              throw new Error("database failed after promote");
            };
            try {
              return await withPrismaMocks(
                {
                  branch: {
                    findMany: async () => [{ id: 1 }],
                  },
                },
                () => request((app) => app.post("/test", handleTvUploadErrors, createTvContent), { method: "POST" })
              );
            } finally {
              prisma.$transaction = original;
            }
          }
        )
    )
  );
  assert.equal(failure.status, 500);
  assert.equal(failure.body.code, "INTERNAL_ERROR");
  assert.equal(unlinkCalls, 1);
});

test("tv content update preserves success, operational 404 and forwards validation or Prisma errors", async () => {
  const updated = { id: 4, title: "Atualizado", branches: [{ branch: { id: 2, name: "Filial 2" } }] };
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) =>
    callback({
      tvContent: {
        update: async () => ({}),
        findUnique: async () => updated,
      },
      tvContentBranch: {
        deleteMany: async () => {},
        createMany: async () => {},
      },
    });

  try {
    const success = await withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => ({ id: 4, branches: [] }),
        },
      },
      () =>
        request((app) => app.put("/test/:id", updateTvContent), {
          method: "PUT",
          path: "/test/4",
          body: { title: "Atualizado" },
        })
    );
    assert.equal(success.status, 200);
    assert.deepEqual(success.body, { id: 4, title: "Atualizado", branches: [{ id: 2, name: "Filial 2" }] });
  } finally {
    prisma.$transaction = originalTransaction;
  }

  const missing = await withPrismaMocks(
    {
      tvContent: {
        findUnique: async () => null,
      },
    },
    () =>
      request((app) => app.put("/test/:id", updateTvContent), {
        method: "PUT",
        path: "/test/4",
        body: { title: "Atualizado" },
      })
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "TV_CONTENT_NOT_FOUND");

  const invalid = await withSilencedApiLogs(() =>
    request((app) => app.put("/test/:id", updateTvContent), {
      method: "PUT",
      path: "/test/4",
      body: { fileUrl: "/uploads/tv/client.png" },
    })
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");

  const failure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => {
            throw new Error("update lookup failed with stack");
          },
        },
      },
      () =>
        request((app) => app.put("/test/:id", updateTvContent), {
          method: "PUT",
          path: "/test/4",
          body: { title: "Atualizado" },
        })
    )
  );
  assert.equal(failure.status, 500);
  assert.equal(failure.body.code, "INTERNAL_ERROR");
});

test("tv content toggle preserves success and operational 404, then forwards technical errors", async () => {
  const success = await withPrismaMocks(
    {
      tvContent: {
        findUnique: async () => ({ id: 4, isActive: true, branches: [] }),
        update: async (args) => {
          assert.deepEqual(args, { where: { id: 4 }, data: { isActive: false } });
          return { id: 4, isActive: false };
        },
      },
    },
    () => request((app) => app.patch("/test/:id/toggle", toggleTvContent), { method: "PATCH", path: "/test/4/toggle" })
  );
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, { id: 4, isActive: false, branches: [] });

  const missing = await withPrismaMocks(
    {
      tvContent: {
        findUnique: async () => null,
      },
    },
    () => request((app) => app.patch("/test/:id/toggle", toggleTvContent), { method: "PATCH", path: "/test/4/toggle" })
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "TV_CONTENT_NOT_FOUND");

  const failure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => {
            throw new Error("toggle failed with stack");
          },
        },
      },
      () => request((app) => app.patch("/test/:id/toggle", toggleTvContent), { method: "PATCH", path: "/test/4/toggle" })
    )
  );
  assert.equal(failure.status, 500);
  assert.equal(failure.body.code, "INTERNAL_ERROR");
});

test("tv content delete preserves success, operational 404 and forwards technical errors without leaking paths", async () => {
  let deleted = false;
  const success = await withFsMocks(
    {
      unlink: async (filePath) => {
        assert.equal(filePath.startsWith(tvUploadDir), true);
      },
    },
    () =>
      withPrismaMocks(
        {
          tvContent: {
            findUnique: async () => ({ id: 5, fileUrl: "/uploads/tv/a.png", branches: [] }),
            delete: async () => {
              deleted = true;
            },
          },
        },
        () => request((app) => app.delete("/test/:id", deleteTvContent), { method: "DELETE", path: "/test/5" })
      )
  );
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, { ok: true });
  assert.equal(deleted, true);

  const missing = await withPrismaMocks(
    {
      tvContent: {
        findUnique: async () => null,
      },
    },
    () => request((app) => app.delete("/test/:id", deleteTvContent), { method: "DELETE", path: "/test/5" })
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "TV_CONTENT_NOT_FOUND");

  const failure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => ({ id: 5, fileUrl: "/uploads/tv/a.png", branches: [] }),
          delete: async () => {
            throw new Error(`delete failed at ${tvUploadDir}`);
          },
        },
      },
      () => request((app) => app.delete("/test/:id", deleteTvContent), { method: "DELETE", path: "/test/5" })
    )
  );
  assert.equal(failure.status, 500);
  assert.deepEqual(failure.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(failure.body).includes(tvUploadDir), false);
});

const visitInput = {
  visitorId: 55,
  areaToVisit: "Recepcao",
  attendedBy: "Maria",
  serviceType: "Reuniao",
};

const freshVisitor = {
  id: 55,
  cpf: visitorCpf,
  name: "Maria Silva",
  photoBytes: Buffer.from("photo"),
  photoMime: "image/jpeg",
  photoUpdatedAt: new Date(),
  documentFrontBytes: Buffer.from("front"),
  documentFrontMime: "image/jpeg",
  documentFrontUpdatedAt: new Date(),
  documentBackBytes: Buffer.from("back"),
  documentBackMime: "image/jpeg",
  documentBackUpdatedAt: new Date(),
};

function openVisitP2002(meta) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta,
  });
}

test("visits checkin success keeps the 201 visit response", async () => {
  const visit = { id: 10, visitCode: "12345678" };
  let visitorFinds = 0;

  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? freshVisitor : { id: 55, createdInBranchId: 2 }),
      },
      branch: {
        findUnique: async () => ({ id: 2, name: "Dimebras SP" }),
      },
      visit: {
        findFirst: async () => null,
        create: async () => visit,
      },
    },
    () =>
      request((app) => app.post("/test", checkin), {
        method: "POST",
        body: visitInput,
      })
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, visit);
});

test("visits checkin operational open-visit conflict remains preserved", async () => {
  let visitorFinds = 0;
  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? freshVisitor : { id: 55, createdInBranchId: 2 }),
      },
      branch: {
        findUnique: async () => ({ id: 2, name: "Dimebras SP" }),
      },
      visit: {
        findFirst: async () => ({ id: 99 }),
        create: async () => ({ id: 10 }),
      },
    },
    () =>
      request((app) => app.post("/test", checkin), {
        method: "POST",
        body: visitInput,
      })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    message: "Visitante j\u00e1 possui visita em andamento.",
    code: "VISITOR_OPEN_VISIT_CONFLICT",
    details: null,
  });
});

test("visits checkin Zod validation is normalized globally", async () => {
  let createCalled = false;
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          create: async () => {
            createCalled = true;
            return {};
          },
        },
      },
      () =>
        request((app) => app.post("/test", checkin), {
          method: "POST",
          body: { ...visitInput, branchId: 99 },
        })
    )
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Dados inv\u00e1lidos.");
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(Array.isArray(response.body.details), true);
  assert.equal("issues" in response.body, false);
  assert.equal(createCalled, false);
});

test("visits checkin race P2002 converted by service remains operational", async () => {
  let visitorFinds = 0;
  const response = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? freshVisitor : { id: 55, createdInBranchId: 2 }),
      },
      branch: {
        findUnique: async () => ({ id: 2, name: "Dimebras SP" }),
      },
      visit: {
        findFirst: async () => null,
        create: async () => {
          throw openVisitP2002({ target: "visits_one_open_per_visitor_branch_idx" });
        },
      },
    },
    () =>
      request((app) => app.post("/test", checkin), {
        method: "POST",
        body: visitInput,
      })
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VISITOR_OPEN_VISIT_CONFLICT");
});

test("visits checkin technical error is normalized globally without stack", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            throw new Error("select * from visitors with stack");
          },
        },
      },
      () =>
        request((app) => app.post("/test", checkin), {
          method: "POST",
          body: visitInput,
        })
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

test("visits open by CPF success and operational 404 keep their contracts", async () => {
  const visit = { id: 20, visitCode: "12345678", visitor: { name: "Maria", cpf: visitorCpf } };

  const success = await withPrismaMocks(
    {
      visit: {
        findFirst: async () => visit,
      },
    },
    () =>
      request((app) => app.get("/test/:cpf", openByCpf), {
        path: `/test/${visitorCpf}`,
      })
  );

  assert.equal(success.status, 200);
  assert.deepEqual(success.body, visit);

  const missing = await withPrismaMocks(
    {
      visit: {
        findFirst: async () => null,
      },
    },
    () =>
      request((app) => app.get("/test/:cpf", openByCpf), {
        path: `/test/${visitorCpf}`,
      })
  );

  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, {
    message: "Nenhuma visita em aberto",
    code: "OPEN_VISIT_NOT_FOUND",
    details: null,
  });
});

test("visits open by CPF technical error is normalized globally", async () => {
  const response = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          findFirst: async () => {
            throw new Error("findFirst visit failed with stack");
          },
        },
      },
      () =>
        request((app) => app.get("/test/:cpf", openByCpf), {
          path: `/test/${visitorCpf}`,
        })
    )
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
});

test("visits open list success returns items wrapper and Prisma errors go global", async () => {
  const items = [{ id: 31, visitCode: "87654321" }];
  const success = await withPrismaMocks(
    {
      visit: {
        findMany: async () => items,
      },
    },
    () => request((app) => app.get("/test", getOpenVisitsMyBranch))
  );

  assert.equal(success.status, 200);
  assert.deepEqual(success.body, { items });

  const prismaError = new Prisma.PrismaClientKnownRequestError("Invalid reference", {
    code: "P2003",
    clientVersion: "test",
  });
  const failure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          findMany: async () => {
            throw prismaError;
          },
        },
      },
      () => request((app) => app.get("/test", getOpenVisitsMyBranch))
    )
  );

  assert.equal(failure.status, 400);
  assert.deepEqual(failure.body, {
    message: "Refer\u00eancia inv\u00e1lida.",
    code: "INVALID_REFERENCE",
    details: null,
  });
});

test("visits stats and recent keep success shape and use global validation/error handling", async () => {
  const stats = await withPrismaMocks(
    {
      visit: {
        count: async (args) => (args.where.checkoutAt === null ? 1 : 3),
      },
    },
    () =>
      request((app) => app.get("/test/:cpf", statsByCpf), {
        path: `/test/${visitorCpf}`,
      })
  );

  assert.equal(stats.status, 200);
  assert.deepEqual(stats.body, { cpf: visitorCpf, total: 3, open: 1, closed: 2 });

  const invalid = await withSilencedApiLogs(() =>
    request((app) => app.get("/test/:cpf", recentByCpf), {
      path: "/test/11111111111",
    })
  );

  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");

  const technical = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          findMany: async () => {
            throw new Error("recent visits failed with stack");
          },
        },
      },
      () =>
        request((app) => app.get("/test/:cpf", recentByCpf), {
          path: `/test/${visitorCpf}`,
        })
    )
  );

  assert.equal(technical.status, 500);
  assert.equal(technical.body.code, "INTERNAL_ERROR");
});

test("visits recent success keeps cpf and items response", async () => {
  const items = [{ id: 40, visitCode: "12345678" }];
  const response = await withPrismaMocks(
    {
      visit: {
        findMany: async () => items,
      },
    },
    () =>
      request((app) => app.get("/test/:cpf", recentByCpf), {
        path: `/test/${visitorCpf}?limit=5`,
      })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { cpf: visitorCpf, items });
});

test("visits label token success, safe 404, and JWT errors keep their contracts", async () => {
  const success = await withJwtSignMock(
    () => "label-token",
    () =>
      withPrismaMocks(
        {
          visit: {
            findUnique: async () => ({ id: 77, branchId: 2 }),
          },
        },
        () =>
          request((app) => app.post("/test/:id/label-token", labelToken), {
            method: "POST",
            path: "/test/77/label-token",
          })
      )
  );

  assert.equal(success.status, 200);
  assert.equal(success.body.token, "label-token");
  assert.equal(Number.isInteger(success.body.expiresInSeconds), true);

  const missing = await withPrismaMocks(
    {
      visit: {
        findUnique: async () => null,
      },
    },
    () =>
      request((app) => app.post("/test/:id/label-token", labelToken), {
        method: "POST",
        path: "/test/77/label-token",
      })
  );

  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "VISIT_NOT_FOUND");

  const jwtFailure = await withSilencedApiLogs(() =>
    withJwtSignMock(
      () => {
        throw new Error("jwt sign failed with stack");
      },
      () =>
        withPrismaMocks(
          {
            visit: {
              findUnique: async () => ({ id: 77, branchId: 2 }),
            },
          },
          () =>
            request((app) => app.post("/test/:id/label-token", labelToken), {
              method: "POST",
              path: "/test/77/label-token",
            })
        )
    )
  );

  assert.equal(jwtFailure.status, 500);
  assert.equal(jwtFailure.body.code, "INTERNAL_ERROR");
});

test("visits label success with Bearer keeps HTML, QR, escaping, CSP, and headers", async () => {
  const token = jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(10));
  const visit = {
    id: 77,
    branchId: 2,
    visitCode: "ABC<123>&",
    checkinAt: new Date("2099-01-02T13:04:05.000Z"),
    attendedBy: "Joao <Atende> & \"Time\"",
    visitor: {
      name: "Maria <Silva> & \"Ana\"",
      cpf: "52998224725",
      company: "Empresa <script>alert(1)</script>",
    },
    branch: { id: 2, name: "Filial <Centro> & Oeste" },
  };
  let qrArgs;

  const response = await withQRCodeToDataURLMock(
    async (...args) => {
      qrArgs = args;
      return "data:image/png;base64,QRDATA";
    },
    () =>
      withPrismaMocks(
        {
          visit: {
            findUnique: async () => visit,
          },
          user: {
            findUnique: async () => ({
              id: 10,
              role: "ADMIN",
              branchId: 999,
              isActive: true,
            }),
          },
        },
        () =>
          requestBinary((app) => app.get("/test/:id/label", label), {
            path: "/test/77/label",
            headers: { authorization: `Bearer ${token}` },
          })
      )
  );

  const html = response.bytes.toString("utf8");
  const csp = response.headers.get("content-security-policy");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), null);
  assert.deepEqual(qrArgs, ["ABC<123>&", { margin: 0, scale: 8 }]);
  assert.match(csp, /^default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-[A-Za-z0-9+/=]+'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'$/);
  assert.match(html, /^\s*<!doctype html>/);
  assert.match(html, /<html>/);
  assert.match(html, /<meta charset="utf-8" \/>/);
  assert.match(html, /<title>Etiqueta<\/title>/);
  assert.match(html, /<button id="print-button" type="button">IMPRIMIR<\/button>/);
  assert.match(html, /<button id="close-button" type="button" class="secondary">/);
  assert.match(html, /<p><b>Nome:<\/b> Maria &lt;Silva&gt; &amp; &quot;Ana&quot;<\/p>/);
  assert.match(html, /<p><b>CPF:<\/b> 52998224725<\/p>/);
  assert.match(html, /<p><b>Empresa:<\/b> Empresa &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/p>/);
  assert.match(html, /<p><b>Falar com:<\/b> Joao &lt;Atende&gt; &amp; &quot;Time&quot;<\/p>/);
  assert.match(html, /<p class="small"><b>Unidade:<\/b> Filial &lt;Centro&gt; &amp; Oeste<\/p>/);
  assert.match(html, /<p class="small"><b>Entrada:<\/b> /);
  assert.match(html, /<p class="code"><b>Código:<\/b> ABC&lt;123&gt;&amp;<\/p>/);
  assert.match(html, /<img class="qr" src="data:image\/png;base64,QRDATA" alt="QR Code da visita" \/>/);
  assert.match(html, /<script nonce="[A-Za-z0-9+/=]+">/);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
});

test("visits label success with label token preserves token access contract", async () => {
  const token = jwt.sign(
    { purpose: "visit-label", visitId: 78, branchId: 4 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const response = await withQRCodeToDataURLMock(
    async () => "data:image/png;base64,TOKENQR",
    () =>
      withPrismaMocks(
        {
          visit: {
            findUnique: async () => ({
              id: 78,
              branchId: 4,
              visitCode: "87654321",
              checkinAt: new Date("2099-01-02T13:04:05.000Z"),
              attendedBy: "Maria",
              visitor: { name: "Visitante", cpf: "52998224725", company: "Dimebras" },
              branch: { id: 4, name: "Filial B" },
            }),
          },
        },
        () =>
          requestBinary((app) => app.get("/test/:id/label", label), {
            path: `/test/78/label?token=${encodeURIComponent(token)}`,
          })
      )
  );

  const html = response.bytes.toString("utf8");
  assert.equal(response.status, 200);
  assert.match(html, /<p><b>Nome:<\/b> Visitante<\/p>/);
  assert.match(html, /<p><b>CPF:<\/b> 52998224725<\/p>/);
  assert.match(html, /src="data:image\/png;base64,TOKENQR"/);
});

test("visits label operational denials keep current plain responses", async () => {
  const baseVisit = {
    id: 79,
    branchId: 5,
    visitCode: "12345678",
    checkinAt: new Date("2099-01-02T13:04:05.000Z"),
    attendedBy: "Maria",
    visitor: { name: "Visitante", cpf: "52998224725", company: "Dimebras" },
    branch: { id: 5, name: "Filial C" },
  };
  const invalidToken = "not-a-valid-token";
  const expiredToken = jwt.sign(
    { purpose: "visit-label", visitId: 79, branchId: 5, exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET
  );
  const otherVisitToken = jwt.sign(
    { purpose: "visit-label", visitId: 999, branchId: 5 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const inactiveBearer = jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(10));

  async function labelRequest(path, userFindUnique = async () => null) {
    return withPrismaMocks(
      {
        visit: {
          findUnique: async () => baseVisit,
        },
        user: {
          findUnique: userFindUnique,
        },
      },
      () => requestBinary((app) => app.get("/test/:id/label", label), { path })
    );
  }

  const missingToken = await labelRequest("/test/79/label");
  assert.equal(missingToken.status, 404);
  assert.equal(missingToken.bytes.toString("utf8"), "Visita não encontrada");

  const invalid = await labelRequest(`/test/79/label?token=${encodeURIComponent(invalidToken)}`);
  assert.equal(invalid.status, 404);
  assert.equal(invalid.bytes.toString("utf8"), "Visita não encontrada");

  const expired = await labelRequest(`/test/79/label?token=${encodeURIComponent(expiredToken)}`);
  assert.equal(expired.status, 404);
  assert.equal(expired.bytes.toString("utf8"), "Visita não encontrada");

  const otherVisit = await labelRequest(`/test/79/label?token=${encodeURIComponent(otherVisitToken)}`);
  assert.equal(otherVisit.status, 404);
  assert.equal(otherVisit.bytes.toString("utf8"), "Visita não encontrada");

  const inactive = await withPrismaMocks(
    {
      visit: {
        findUnique: async () => baseVisit,
      },
      user: {
        findUnique: async () => ({ id: 10, role: "RECEPCAO", branchId: 5, isActive: false }),
      },
    },
    () =>
      requestBinary((app) => app.get("/test/:id/label", label), {
        path: "/test/79/label",
        headers: { authorization: `Bearer ${inactiveBearer}` },
      })
  );
  assert.equal(inactive.status, 404);
  assert.equal(inactive.bytes.toString("utf8"), "Visita não encontrada");

  const missingVisit = await withPrismaMocks(
    {
      visit: {
        findUnique: async () => null,
      },
    },
    () => requestBinary((app) => app.get("/test/:id/label", label), { path: "/test/999/label" })
  );
  assert.equal(missingVisit.status, 404);
  assert.equal(missingVisit.bytes.toString("utf8"), "Visita não encontrada");
});

test("visits label technical failures go through the global error handler", async () => {
  const prismaFailure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => {
            throw new Error("select cpf from visits with stack");
          },
        },
      },
      () => requestBinary((app) => app.get("/test/:id/label", label), { path: "/test/80/label" })
    )
  );

  assert.equal(prismaFailure.status, 500);
  assert.deepEqual(prismaFailure.body, {
    message: "Erro interno",
    code: "INTERNAL_ERROR",
    details: null,
  });
  assert.equal(JSON.stringify(prismaFailure.body).includes("stack"), false);
  assert.equal(JSON.stringify(prismaFailure.body).includes("select cpf"), false);

  const bearer = jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(10));
  const qrFailure = await withSilencedApiLogs(() =>
    withQRCodeToDataURLMock(
      async () => {
        throw new Error("qr generation failed with stack");
      },
      () =>
        withPrismaMocks(
          {
            visit: {
              findUnique: async () => ({
                id: 80,
                branchId: 2,
                visitCode: "12345678",
                checkinAt: new Date("2099-01-02T13:04:05.000Z"),
                attendedBy: "Maria",
                visitor: { name: "Visitante", cpf: "52998224725", company: "Dimebras" },
                branch: { id: 2, name: "Filial B" },
              }),
            },
            user: {
              findUnique: async () => ({ id: 10, role: "ADMIN", branchId: 2, isActive: true }),
            },
          },
          () =>
            requestBinary((app) => app.get("/test/:id/label", label), {
              path: "/test/80/label",
              headers: { authorization: `Bearer ${bearer}` },
            })
        )
    )
  );

  assert.equal(qrFailure.status, 500);
  assert.equal(qrFailure.body.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(qrFailure.body).includes("qr generation failed"), false);
});

test("visits label forwards send errors after headers are sent", async () => {
  const bearer = jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(10));
  const sendError = new Error("socket write failed");
  const req = {
    params: { id: "81" },
    query: {},
    headers: { authorization: `Bearer ${bearer}` },
  };
  const res = {
    headersSent: false,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send() {
      this.headersSent = true;
      throw sendError;
    },
  };
  let forwardedError;

  await withQRCodeToDataURLMock(
    async () => "data:image/png;base64,QRDATA",
    () =>
      withPrismaMocks(
        {
          visit: {
            findUnique: async () => ({
              id: 81,
              branchId: 2,
              visitCode: "12345678",
              checkinAt: new Date("2099-01-02T13:04:05.000Z"),
              attendedBy: "Maria",
              visitor: { name: "Visitante", cpf: "52998224725", company: "Dimebras" },
              branch: { id: 2, name: "Filial B" },
            }),
          },
          user: {
            findUnique: async () => ({ id: 10, role: "ADMIN", branchId: 2, isActive: true }),
          },
        },
        () =>
          label(req, res, (error) => {
            forwardedError = error;
          })
      )
  );

  assert.equal(forwardedError, sendError);
  assert.equal(res.headersSent, true);
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
  assert.ok(res.headers["Content-Security-Policy"]);
});

test("visits get by ID success, safe 404, and technical error go through current contracts", async () => {
  const visit = { id: 88, branch: { id: 2 }, visitor: { id: 55 } };
  const success = await withPrismaMocks(
    {
      visit: {
        findUnique: async () => visit,
      },
    },
    () =>
      request((app) => app.get("/test/:id", getVisitById), {
        path: "/test/88",
      })
  );

  assert.equal(success.status, 200);
  assert.deepEqual(success.body, visit);

  const missing = await withPrismaMocks(
    {
      visit: {
        findUnique: async () => null,
      },
    },
    () =>
      request((app) => app.get("/test/:id", getVisitById), {
        path: "/test/88",
      })
  );

  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "VISIT_NOT_FOUND");

  const technical = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => {
            throw new Error("visit detail failed with stack");
          },
        },
      },
      () =>
        request((app) => app.get("/test/:id", getVisitById), {
          path: "/test/88",
        })
    )
  );

  assert.equal(technical.status, 500);
  assert.equal(technical.body.code, "INTERNAL_ERROR");
});

test("visits checkout success, operational 404, Zod, and Prisma errors keep their contracts", async () => {
  const checkedOut = { id: 91, visitCode: "12345678", checkoutAt: "now" };
  const success = await withPrismaMocks(
    {
      visit: {
        findFirst: async () => ({ id: 91 }),
        update: async () => checkedOut,
      },
    },
    () =>
      request((app) => app.post("/test", checkout), {
        method: "POST",
        body: { visitCode: "12345678" },
      })
  );

  assert.equal(success.status, 200);
  assert.deepEqual(success.body, checkedOut);

  const missing = await withPrismaMocks(
    {
      visit: {
        findFirst: async () => null,
        update: async () => ({}),
      },
    },
    () =>
      request((app) => app.post("/test", checkout), {
        method: "POST",
        body: { visitCode: "12345678" },
      })
  );

  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "OPEN_VISIT_NOT_FOUND");

  const invalid = await withSilencedApiLogs(() =>
    request((app) => app.post("/test", checkout), {
      method: "POST",
      body: { visitCode: "123" },
    })
  );

  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");

  const prismaError = new Prisma.PrismaClientKnownRequestError("Record missing", {
    code: "P2025",
    clientVersion: "test",
  });
  const failure = await withSilencedApiLogs(() =>
    withPrismaMocks(
      {
        visit: {
          findFirst: async () => ({ id: 91 }),
          update: async () => {
            throw prismaError;
          },
        },
      },
      () =>
        request((app) => app.post("/test", checkout), {
          method: "POST",
          body: { visitCode: "12345678" },
        })
    )
  );

  assert.equal(failure.status, 404);
  assert.deepEqual(failure.body, {
    message: "Registro n\u00e3o encontrado",
    code: "RESOURCE_NOT_FOUND",
    details: null,
  });
  assert.equal(JSON.stringify(failure.body).includes("stack"), false);
});
