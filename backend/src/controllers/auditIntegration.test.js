import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import AuditService from "../services/audit.service.js";
import { tvTempUploadDir } from "../config/uploads.js";
import { labelTokenSignOptions } from "../config/labelToken.js";
import { requestContext } from "../middlewares/requestContext.js";
import { normalizeErrorResponses, errorHandler } from "../middlewares/errorHandler.js";
import { login } from "./auth.controller.js";
import {
  createVisitor,
  createVisitorWithFiles,
  updateVisitor,
  updateVisitorFiles,
} from "./visitors.controller.js";
import { checkin, checkout, label, labelToken } from "./visits.controller.js";
import {
  createTvContent,
  deleteTvContent,
  toggleTvContent,
  updateTvContent,
} from "./tvContent.controller.js";
import { createEvent, updateEvent, cancelEvent } from "./agenda.controller.js";
import {
  createUser,
  updateUser,
  disableUser,
  enableUser,
} from "./users.controller.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-32-characters-safe";

const VALID_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const jpegFile = {
  originalname: "secret-document.jpg",
  mimetype: "image/jpeg",
  buffer: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
  ]),
};
const pngHead = Buffer.from([
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

function withAuditMock(replacement, fn) {
  const originalLog = AuditService.log;
  const calls = [];

  AuditService.log = async (payload) => {
    calls.push(payload);
    return replacement ? replacement(payload) : { id: 1, ...payload };
  };

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      AuditService.log = originalLog;
    });
}

function withAuthMocks({ user, compare = async () => true, sign = () => "signed-token" }, fn) {
  const originalCompare = bcrypt.compare;
  const originalSign = jwt.sign;

  bcrypt.compare = compare;
  jwt.sign = sign;

  return Promise.resolve()
    .then(() =>
      withPrismaMocks(
        {
          user: {
            findUnique: async () => user,
          },
        },
        fn
      )
    )
    .finally(() => {
      bcrypt.compare = originalCompare;
      jwt.sign = originalSign;
    });
}

async function request(route, options = {}) {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use(normalizeErrorResponses);
  app.use((req, res, next) => {
    req.user = options.user || { id: 7, role: "ADMIN", branchId: 2 };
    if (options.files) req.files = options.files;
    if (options.file) req.file = options.file;
    if (options.cleanupTvTempUpload) req.cleanupTvTempUpload = options.cleanupTvTempUpload;
    next();
  });
  route(app);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${options.path || "/test"}`, {
      method: options.method || "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": VALID_REQUEST_ID,
        "User-Agent": "audit-test-agent",
        ...(options.headers || {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function validVisitorBody() {
  return {
    name: "Maria Silva",
    cpf: "52998224725",
    phone: "11999999999",
    company: "Empresa",
  };
}

function validCheckinBody() {
  return {
    visitorId: 55,
    areaToVisit: "Recepcao",
    attendedBy: "Carlos",
    serviceType: "Entrega",
  };
}

function validAgendaBody(overrides = {}) {
  return {
    visitorName: "Maria Agenda",
    company: "Empresa Agenda",
    eventWith: "Carlos Agenda",
    department: "Recepcao",
    eventDateTime: "2099-01-01T10:00:00.000Z",
    observation: "Observacao sigilosa",
    ...overrides,
  };
}

function assertNoSensitiveAuditData(call) {
  const serialized = JSON.stringify(call);
  for (const forbidden of [
    "Maria",
    "52998224725",
    "11999999999",
    "Empresa",
    "secret-document.jpg",
    "image/jpeg",
    "signed-token",
    "valid-password",
    "password",
    "buffer",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

function assertNoUnsafeAgendaAuditData(call) {
  const serialized = JSON.stringify(call);
  for (const forbidden of [
    "Maria Agenda",
    "Empresa Agenda",
    "Carlos Agenda",
    "Recepcao",
    "Observacao sigilosa",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

function assertNoUnsafeUserAuditData(call) {
  const serialized = JSON.stringify(call);
  for (const forbidden of [
    "novo.admin",
    "old.user",
    "new.user",
    "StrongPass123",
    "OtherPass123",
    "passwordHash",
    "hash",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

function assertNoUnsafeLabelAuditData(call) {
  const serialized = JSON.stringify(call);
  for (const forbidden of [
    "label-token",
    "signed-token",
    "jwt",
    "QRCode",
    "QR Code",
    "data:image",
    "<html",
    "<!doctype",
    "12345678",
    "87654321",
    "Maria",
    "52998224725",
    "Dimebras",
    "token",
    "url",
    "html",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

test("valid login registers LOGIN with safe context and metadata", async () => {
  const user = {
    id: 7,
    username: "alice",
    passwordHash: "hash",
    role: "ADMIN",
    branchId: 2,
    isActive: true,
    branch: { id: 2, name: "Matriz" },
  };

  const response = await withAuditMock(null, (calls) =>
    withAuthMocks({ user }, async () => {
      const result = await request((app) => app.post("/test", login), {
        body: { username: "alice", password: "valid-password" },
      });

      assert.equal(result.status, 200);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], {
        userId: 7,
        branchId: 2,
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "audit-test-agent",
        requestId: VALID_REQUEST_ID,
        action: "LOGIN",
        entity: "AUTH",
        entityId: "7",
        metadata: { success: true },
      });
      assertNoSensitiveAuditData(calls[0]);
      return result;
    })
  );

  assert.equal(response.body.token, "signed-token");
});

test("invalid login does not register audit", async () => {
  await withAuditMock(null, (calls) =>
    withAuthMocks(
      {
        user: {
          id: 7,
          username: "alice",
          passwordHash: "hash",
          role: "ADMIN",
          branchId: 2,
          isActive: true,
          branch: { id: 2, name: "Matriz" },
        },
        compare: async () => false,
      },
      async () => {
        const response = await request((app) => app.post("/test", login), {
          body: { username: "alice", password: "wrong-password" },
        });

        assert.equal(response.status, 401);
        assert.equal(calls.length, 0);
      }
    )
  );
});

test("audit failure does not block login", async () => {
  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withAuthMocks(
        {
          user: {
            id: 7,
            username: "alice",
            passwordHash: "hash",
            role: "ADMIN",
            branchId: 2,
            isActive: true,
            branch: { id: 2, name: "Matriz" },
          },
        },
        async () => {
          const response = await request((app) => app.post("/test", login), {
            body: { username: "alice", password: "valid-password" },
          });

          assert.equal(response.status, 200);
          assert.equal(response.body.token, "signed-token");
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("POST /visitors registers VISITOR_CREATE without PII", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          create: async () => ({ id: 101, ...validVisitorBody(), createdAt: "now" }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", createVisitor), {
          body: validVisitorBody(),
        });

        assert.equal(response.status, 201);
        assert.deepEqual(calls[0], {
          userId: 7,
          branchId: 2,
          ipAddress: "::ffff:127.0.0.1",
          userAgent: "audit-test-agent",
          requestId: VALID_REQUEST_ID,
          action: "VISITOR_CREATE",
          entity: "VISITOR",
          entityId: "101",
          metadata: { withFiles: false },
        });
        assertNoSensitiveAuditData(calls[0]);
      }
    )
  );
});

test("POST /visitors/with-files registers VISITOR_CREATE with withFiles true", async () => {
  await withAuditMock(null, (calls) => {
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = async (callback) =>
      callback({
        visitor: {
          create: async () => ({
            id: 102,
            ...validVisitorBody(),
            photoUpdatedAt: "now",
            documentFrontUpdatedAt: "now",
            documentBackUpdatedAt: "now",
            createdAt: "now",
          }),
        },
      });

    return Promise.resolve()
      .then(async () => {
        const response = await request((app) => app.post("/test", createVisitorWithFiles), {
          body: validVisitorBody(),
          files: {
            photo: [jpegFile],
            documentFront: [jpegFile],
            documentBack: [jpegFile],
          },
        });

        assert.equal(response.status, 201);
        assert.equal(calls[0].action, "VISITOR_CREATE");
        assert.equal(calls[0].entity, "VISITOR");
        assert.equal(calls[0].entityId, "102");
        assert.deepEqual(calls[0].metadata, { withFiles: true });
        assertNoSensitiveAuditData(calls[0]);
      })
      .finally(() => {
        prisma.$transaction = originalTransaction;
      });
  });
});

test("visitor create conflict and validation failure do not register audit", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          create: async () => {
            throw new Prisma.PrismaClientKnownRequestError("Unique failed", {
              code: "P2002",
              clientVersion: "test",
              meta: { target: ["cpf"] },
            });
          },
        },
      },
      async () => {
        const conflict = await request((app) => app.post("/test", createVisitor), {
          body: validVisitorBody(),
        });
        assert.equal(conflict.status, 409);

        const invalid = await request((app) => app.post("/test", createVisitor), {
          body: { ...validVisitorBody(), cpf: "111" },
        });
        assert.equal(invalid.status, 400);
        assert.equal(calls.length, 0);
      }
    )
  );
});

test("audit failure does not block visitor create", async () => {
  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          visitor: {
            create: async () => ({ id: 101, ...validVisitorBody(), createdAt: "now" }),
          },
        },
        async () => {
          const response = await request((app) => app.post("/test", createVisitor), {
            body: validVisitorBody(),
          });

          assert.equal(response.status, 201);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("PUT /visitors/:id/files registers only boolean file metadata after success", async () => {
  let findUniqueCalls = 0;

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            findUniqueCalls += 1;
            if (findUniqueCalls === 1) return { id: 101, createdInBranchId: 2 };
            return {
              photoBytes: Buffer.from("stored"),
              photoMime: "image/jpeg",
              documentFrontBytes: Buffer.from("stored"),
              documentFrontMime: "image/jpeg",
              documentBackBytes: Buffer.from("stored"),
              documentBackMime: "image/jpeg",
            };
          },
          update: async () => ({
            id: 101,
            cpf: "52998224725",
            photoUpdatedAt: "now",
            documentFrontUpdatedAt: null,
            documentBackUpdatedAt: null,
          }),
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id/files", updateVisitorFiles), {
          method: "PUT",
          path: "/test/101/files",
          files: {
            photo: [jpegFile],
          },
        });

        assert.equal(response.status, 200);
        assert.equal(calls[0].action, "VISITOR_FILES_UPDATE");
        assert.equal(calls[0].entityId, "101");
        assert.deepEqual(calls[0].metadata, {
          photoUpdated: true,
          documentFrontUpdated: false,
          documentBackUpdated: false,
        });
        assertNoSensitiveAuditData(calls[0]);
      }
    )
  );
});

test("invalid visitor file update does not register audit and audit failure does not block success", async () => {
  const invalidFile = { ...jpegFile, buffer: Buffer.from("not an image") };

  let findUniqueCalls = 0;
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            findUniqueCalls += 1;
            if (findUniqueCalls % 2 === 1) return { id: 101, createdInBranchId: 2 };
            return {
              photoBytes: Buffer.from("stored"),
              photoMime: "image/jpeg",
              documentFrontBytes: Buffer.from("stored"),
              documentFrontMime: "image/jpeg",
              documentBackBytes: Buffer.from("stored"),
              documentBackMime: "image/jpeg",
            };
          },
          update: async () => ({ id: 101 }),
        },
      },
      async () => {
        const invalid = await request((app) => app.put("/test/:id/files", updateVisitorFiles), {
          method: "PUT",
          path: "/test/101/files",
          files: { photo: [invalidFile] },
        });
        assert.notEqual(invalid.status, 200);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          visitor: {
            findUnique: async () => ({
              id: 101,
              createdInBranchId: 2,
              photoBytes: Buffer.from("stored"),
              photoMime: "image/jpeg",
              documentFrontBytes: Buffer.from("stored"),
              documentFrontMime: "image/jpeg",
              documentBackBytes: Buffer.from("stored"),
              documentBackMime: "image/jpeg",
            }),
            update: async () => ({ id: 101 }),
          },
        },
        async () => {
          const success = await request((app) => app.put("/test/:id/files", updateVisitorFiles), {
            method: "PUT",
            path: "/test/101/files",
            files: { photo: [jpegFile] },
          });
          assert.equal(success.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("PUT /visitors/:id registers VISITOR_UPDATE only for real phone/company changes", async () => {
  let findUniqueCalls = 0;

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            findUniqueCalls += 1;
            if (findUniqueCalls === 1) return { id: 101, createdInBranchId: 2 };
            return { phone: "11999999999", company: "Empresa Antiga" };
          },
          update: async () => ({
            id: 101,
            name: "Maria Silva",
            cpf: "52998224725",
            phone: "11888888888",
            company: "Empresa Nova",
            updatedAt: "now",
          }),
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateVisitor), {
          method: "PUT",
          path: "/test/101",
          body: { phone: "11888888888", company: "Empresa Nova" },
        });

        assert.equal(response.status, 200);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].action, "VISITOR_UPDATE");
        assert.equal(calls[0].entity, "VISITOR");
        assert.equal(calls[0].entityId, "101");
        assert.equal(calls[0].description, "Cadastro do visitante atualizado");
        assert.deepEqual(calls[0].metadata, {
          phoneChanged: true,
          companyChanged: true,
        });
        assertNoSensitiveAuditData(calls[0]);
        assert.equal(JSON.stringify(calls[0]).includes("11888888888"), false);
        assert.equal(JSON.stringify(calls[0]).includes("Empresa Nova"), false);
      }
    )
  );
});

test("visitor update validation, denied access and no-op do not register audit", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => ({ id: 101, createdInBranchId: 2 }),
          update: async () => ({ id: 101 }),
        },
      },
      async () => {
        const invalid = await request((app) => app.put("/test/:id", updateVisitor), {
          method: "PUT",
          path: "/test/101",
          body: { cpf: "52998224725" },
        });
        assert.equal(invalid.status, 400);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => ({ id: 101, createdInBranchId: 3 }),
        },
        visit: {
          findFirst: async () => null,
        },
      },
      async () => {
        const denied = await request((app) => app.put("/test/:id", updateVisitor), {
          method: "PUT",
          path: "/test/101",
          user: { id: 8, role: "RECEPCAO", branchId: 2 },
          body: { phone: "11888888888" },
        });
        assert.equal(denied.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  let findUniqueCalls = 0;
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => {
            findUniqueCalls += 1;
            if (findUniqueCalls === 1) return { id: 101, createdInBranchId: 2 };
            return { phone: "11999999999", company: "Empresa" };
          },
          update: async () => ({ id: 101, phone: "11999999999", company: "Empresa" }),
        },
      },
      async () => {
        const noop = await request((app) => app.put("/test/:id", updateVisitor), {
          method: "PUT",
          path: "/test/101",
          body: { phone: "11999999999", company: "Empresa" },
        });
        assert.equal(noop.status, 200);
        assert.equal(calls.length, 0);
      }
    )
  );
});

test("audit failure does not block visitor update", async () => {
  let findUniqueCalls = 0;

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          visitor: {
            findUnique: async () => {
              findUniqueCalls += 1;
              if (findUniqueCalls === 1) return { id: 101, createdInBranchId: 2 };
              return { phone: "11999999999", company: "Empresa" };
            },
            update: async () => ({ id: 101, phone: "11888888888", company: "Empresa" }),
          },
        },
        async () => {
          const response = await request((app) => app.put("/test/:id", updateVisitor), {
            method: "PUT",
            path: "/test/101",
            body: { phone: "11888888888" },
          });

          assert.equal(response.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});

function assertNoUnsafeTvAuditData(call) {
  const serialized = JSON.stringify(call);
  for (const forbidden of [
    "Campanha Interna",
    "Novo Titulo",
    "banner.png",
    "generated.png",
    "/uploads/tv",
    "image/png",
    "fileSize",
    "mimeType",
    "fileName",
    "path",
    "token",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

async function withTvCreateMocks(fn) {
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) =>
    callback({
      tvContent: {
        create: async () => ({ id: 501 }),
        findUnique: async () => ({
          id: 501,
          title: "Campanha Interna",
          type: "IMAGE",
          fileUrl: "/uploads/tv/generated.png",
          fileName: "banner.png",
          mimeType: "image/png",
          fileSize: pngHead.length,
          order: 1,
          isActive: true,
          branches: [
            { branchId: 1, branch: { id: 1, name: "Filial 1" } },
            { branchId: 2, branch: { id: 2, name: "Filial 2" } },
          ],
        }),
      },
      tvContentBranch: {
        createMany: async () => {},
      },
    });

  try {
    return await withFsMocks(
      {
        open: async () => ({
          read: async (buffer) => {
            pngHead.copy(buffer);
            return { bytesRead: pngHead.length };
          },
          close: async () => {},
        }),
        rename: async () => {},
        unlink: async () => {},
      },
      () =>
        withPrismaMocks(
          {
            branch: {
              findMany: async () => [{ id: 1 }, { id: 2 }],
            },
          },
          fn
        )
    );
  } finally {
    prisma.$transaction = originalTransaction;
  }
}

test("POST /tv-content registers TV_CONTENT_CREATE with safe metadata", async () => {
  await withAuditMock(null, (calls) =>
    withTvCreateMocks(async () => {
      const response = await request((app) => app.post("/test", createTvContent), {
        body: { title: "Campanha Interna", branchIds: "[1,2]", isActive: "true" },
        file: {
          path: path.join(tvTempUploadDir, "audit-create.upload"),
          originalname: "banner.png",
          mimetype: "image/png",
          size: pngHead.length,
        },
      });

      assert.equal(response.status, 201);
      assert.equal(calls[0].action, "TV_CONTENT_CREATE");
      assert.equal(calls[0].entity, "TV_CONTENT");
      assert.equal(calls[0].entityId, "501");
      assert.equal(calls[0].description, "Conteudo de TV criado");
      assert.deepEqual(calls[0].metadata, {
        mediaType: "IMAGE",
        branchCount: 2,
        active: true,
      });
      assertNoUnsafeTvAuditData(calls[0]);
    })
  );
});

test("TV create failures do not audit and audit failure does not alter 201", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        branch: {
          findMany: async () => [],
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", createTvContent), {
          body: { title: "Campanha Interna", branchIds: "[999]" },
          file: {
            path: path.join(tvTempUploadDir, "audit-create-fail.upload"),
            originalname: "banner.png",
            mimetype: "image/png",
            size: pngHead.length,
          },
        });
        assert.equal(response.status, 400);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withTvCreateMocks(async () => {
        const response = await request((app) => app.post("/test", createTvContent), {
          body: { title: "Campanha Interna", branchIds: "[1,2]" },
          file: {
            path: path.join(tvTempUploadDir, "audit-create-ok.upload"),
            originalname: "banner.png",
            mimetype: "image/png",
            size: pngHead.length,
          },
        });
        assert.equal(response.status, 201);
        assert.equal(calls.length, 1);
      })
  );
});

test("PUT /tv-content/:id registers TV_CONTENT_UPDATE with indicators only", async () => {
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) =>
    callback({
      branch: {
        findMany: async () => [{ id: 1 }, { id: 3 }],
      },
      tvContentBranch: {
        deleteMany: async () => {},
        createMany: async () => {},
      },
      tvContent: {
        update: async () => {},
        findUnique: async () => ({
          id: 501,
          title: "Novo Titulo",
          order: 2,
          isActive: true,
          type: "IMAGE",
          branches: [
            { branchId: 1, branch: { id: 1, name: "Filial 1" } },
            { branchId: 3, branch: { id: 3, name: "Filial 3" } },
          ],
        }),
      },
    });

  try {
    await withAuditMock(null, (calls) =>
      withPrismaMocks(
        {
          tvContent: {
            findUnique: async () => ({
              id: 501,
              title: "Campanha Interna",
              order: 1,
              isActive: false,
              branches: [
                { branchId: 1, branch: { id: 1, name: "Filial 1" } },
                { branchId: 2, branch: { id: 2, name: "Filial 2" } },
              ],
            }),
          },
        },
        async () => {
          const response = await request((app) => app.put("/test/:id", updateTvContent), {
            method: "PUT",
            path: "/test/501",
            body: {
              title: "Novo Titulo",
              order: 2,
              isActive: true,
              branchIds: [1, 3],
            },
          });

          assert.equal(response.status, 200);
          assert.equal(calls[0].action, "TV_CONTENT_UPDATE");
          assert.equal(calls[0].entityId, "501");
          assert.deepEqual(calls[0].metadata, {
            titleChanged: true,
            orderChanged: true,
            branchesChanged: true,
            activeChanged: true,
          });
          assertNoUnsafeTvAuditData(calls[0]);
        }
      )
    );
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("TV update failure and no real changes do not audit", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateTvContent), {
          method: "PUT",
          path: "/test/501",
          body: { title: "Novo Titulo" },
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (callback) =>
    callback({
      tvContent: {
        update: async () => {},
        findUnique: async () => ({
          id: 501,
          title: "Campanha Interna",
          order: 1,
          isActive: true,
          branches: [{ branchId: 1, branch: { id: 1, name: "Filial 1" } }],
        }),
      },
    });

  try {
    await withAuditMock(null, (calls) =>
      withPrismaMocks(
        {
          tvContent: {
            findUnique: async () => ({
              id: 501,
              title: "Campanha Interna",
              order: 1,
              isActive: true,
              branches: [{ branchId: 1, branch: { id: 1, name: "Filial 1" } }],
            }),
          },
        },
        async () => {
          const response = await request((app) => app.put("/test/:id", updateTvContent), {
            method: "PUT",
            path: "/test/501",
            body: { title: "Campanha Interna", order: 1, isActive: true },
          });
          assert.equal(response.status, 200);
          assert.equal(calls.length, 0);
        }
      )
    );
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("PATCH /tv-content/:id/toggle audits activate and deactivate using confirmed state", async () => {
  let updateActive = true;

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => ({ id: 501, isActive: !updateActive, branches: [] }),
          update: async () => ({ id: 501, isActive: updateActive }),
        },
      },
      async () => {
        const activate = await request((app) => app.patch("/test/:id/toggle", toggleTvContent), {
          method: "PATCH",
          path: "/test/501/toggle",
        });
        assert.equal(activate.status, 200);

        updateActive = false;
        const deactivate = await request((app) => app.patch("/test/:id/toggle", toggleTvContent), {
          method: "PATCH",
          path: "/test/501/toggle",
        });
        assert.equal(deactivate.status, 200);

        assert.equal(calls[0].action, "TV_CONTENT_ACTIVATE");
        assert.deepEqual(calls[0].metadata, { active: true });
        assert.equal(calls[1].action, "TV_CONTENT_DEACTIVATE");
        assert.deepEqual(calls[1].metadata, { active: false });
      }
    )
  );
});

test("TV toggle error does not audit and audit failure does not alter success", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/toggle", toggleTvContent), {
          method: "PATCH",
          path: "/test/501/toggle",
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          tvContent: {
            findUnique: async () => ({ id: 501, isActive: false, branches: [] }),
            update: async () => ({ id: 501, isActive: true }),
          },
        },
        async () => {
          const response = await request((app) => app.patch("/test/:id/toggle", toggleTvContent), {
            method: "PATCH",
            path: "/test/501/toggle",
          });
          assert.equal(response.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("DELETE /tv-content/:id registers TV_CONTENT_DELETE after deletion", async () => {
  await withAuditMock(null, (calls) =>
    withFsMocks(
      {
        unlink: async () => {},
      },
      () =>
        withPrismaMocks(
          {
            tvContent: {
              findUnique: async () => ({
                id: 501,
                type: "VIDEO",
                title: "Campanha Interna",
                fileUrl: "/uploads/tv/generated.mp4",
                branches: [],
              }),
              delete: async () => {},
            },
          },
          async () => {
            const response = await request((app) => app.delete("/test/:id", deleteTvContent), {
              method: "DELETE",
              path: "/test/501",
            });

            assert.equal(response.status, 200);
            assert.equal(calls[0].action, "TV_CONTENT_DELETE");
            assert.equal(calls[0].entity, "TV_CONTENT");
            assert.equal(calls[0].entityId, "501");
            assert.deepEqual(calls[0].metadata, { mediaType: "VIDEO" });
            assertNoUnsafeTvAuditData(calls[0]);
          }
        )
    )
  );
});

test("TV delete failure does not audit and audit failure does not block deletion", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        tvContent: {
          findUnique: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.delete("/test/:id", deleteTvContent), {
          method: "DELETE",
          path: "/test/501",
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withFsMocks(
        {
          unlink: async () => {},
        },
        () =>
          withPrismaMocks(
            {
              tvContent: {
                findUnique: async () => ({
                  id: 501,
                  type: "IMAGE",
                  fileUrl: "/uploads/tv/generated.png",
                  branches: [],
                }),
                delete: async () => {},
              },
            },
            async () => {
              const response = await request((app) => app.delete("/test/:id", deleteTvContent), {
                method: "DELETE",
                path: "/test/501",
              });
              assert.equal(response.status, 200);
              assert.equal(calls.length, 1);
            }
          )
      )
  );
});

test("POST /agenda registers AGENDA_EVENT_CREATE with safe metadata", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          create: async () => ({
            id: 801,
            branchId: 2,
            createdById: 7,
            status: "AGENDADO",
            ...validAgendaBody(),
            eventDateTime: new Date("2099-01-01T10:00:00.000Z"),
          }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", createEvent), {
          body: validAgendaBody(),
        });

        assert.equal(response.status, 201);
        assert.equal(calls[0].action, "AGENDA_EVENT_CREATE");
        assert.equal(calls[0].entity, "AGENDA_EVENT");
        assert.equal(calls[0].entityId, "801");
        assert.equal(calls[0].branchId, 2);
        assert.deepEqual(calls[0].metadata, { hasEventDateTime: true });
        assertNoUnsafeAgendaAuditData(calls[0]);
      }
    )
  );
});

test("agenda create failure does not audit and audit failure does not alter 201", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          create: async () => {
            throw new Error("create should not run");
          },
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", createEvent), {
          body: { visitorName: "Maria Agenda" },
        });
        assert.equal(response.status, 400);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          agendaEvent: {
            create: async () => ({
              id: 802,
              branchId: 2,
              createdById: 7,
              status: "AGENDADO",
              ...validAgendaBody(),
              eventDateTime: new Date("2099-01-01T10:00:00.000Z"),
            }),
          },
        },
        async () => {
          const response = await request((app) => app.post("/test", createEvent), {
            body: validAgendaBody(),
          });
          assert.equal(response.status, 201);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("PUT /agenda/:id registers AGENDA_EVENT_UPDATE with indicators only", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => ({
            id: 801,
            branchId: 2,
            visitorName: "Maria Agenda",
            company: "Empresa Agenda",
            eventWith: "Carlos Agenda",
            department: "Recepcao",
            eventDateTime: new Date("2098-12-31T10:00:00.000Z"),
            observation: "Observacao anterior",
          }),
          update: async () => ({
            id: 801,
            branchId: 2,
            status: "AGENDADO",
            visitorName: "Visitante Alterado",
            company: "Outra Empresa",
            eventWith: "Outro Responsavel",
            department: "Comercial",
            eventDateTime: new Date("2099-01-01T10:00:00.000Z"),
            observation: "Observacao sigilosa",
          }),
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateEvent), {
          method: "PUT",
          path: "/test/801",
          body: validAgendaBody(),
        });

        assert.equal(response.status, 200);
        assert.equal(calls[0].action, "AGENDA_EVENT_UPDATE");
        assert.equal(calls[0].entity, "AGENDA_EVENT");
        assert.equal(calls[0].entityId, "801");
        assert.deepEqual(calls[0].metadata, {
          dateTimeChanged: true,
          detailsChanged: true,
          observationChanged: true,
        });
        assertNoUnsafeAgendaAuditData(calls[0]);
      }
    )
  );
});

test("agenda update failure, no-op and audit failure preserve behavior", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateEvent), {
          method: "PUT",
          path: "/test/801",
          body: validAgendaBody(),
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  const unchangedEvent = {
    id: 801,
    branchId: 2,
    status: "AGENDADO",
    ...validAgendaBody(),
    eventDateTime: new Date("2099-01-01T10:00:00.000Z"),
  };

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => unchangedEvent,
          update: async () => unchangedEvent,
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateEvent), {
          method: "PUT",
          path: "/test/801",
          body: validAgendaBody(),
        });
        assert.equal(response.status, 200);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          agendaEvent: {
            findFirst: async () => ({
              id: 801,
              branchId: 2,
              visitorName: "Maria Agenda",
              company: "Empresa Agenda",
              eventWith: "Carlos Agenda",
              department: "Recepcao",
              eventDateTime: new Date("2098-12-31T10:00:00.000Z"),
              observation: "Observacao anterior",
            }),
            update: async () => ({
              id: 801,
              branchId: 2,
              status: "AGENDADO",
              ...validAgendaBody({ visitorName: "Visitante Alterado" }),
              eventDateTime: new Date("2099-01-01T10:00:00.000Z"),
            }),
          },
        },
        async () => {
          const response = await request((app) => app.put("/test/:id", updateEvent), {
            method: "PUT",
            path: "/test/801",
            body: validAgendaBody({ visitorName: "Visitante Alterado" }),
          });
          assert.equal(response.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("PATCH /agenda/:id/cancel registers AGENDA_EVENT_DEACTIVATE after status change", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => ({ id: 801, branchId: 2, status: "AGENDADO" }),
          update: async () => ({ id: 801, branchId: 2, status: "CANCELADO" }),
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/cancel", cancelEvent), {
          method: "PATCH",
          path: "/test/801/cancel",
        });

        assert.equal(response.status, 200);
        assert.equal(calls[0].action, "AGENDA_EVENT_DEACTIVATE");
        assert.equal(calls[0].entity, "AGENDA_EVENT");
        assert.equal(calls[0].entityId, "801");
        assert.deepEqual(calls[0].metadata, { active: false });
      }
    )
  );
});

test("agenda cancel failure, no-op and audit failure preserve behavior", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/cancel", cancelEvent), {
          method: "PATCH",
          path: "/test/801/cancel",
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => ({ id: 801, branchId: 2, status: "CANCELADO" }),
          update: async () => ({ id: 801, branchId: 2, status: "CANCELADO" }),
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/cancel", cancelEvent), {
          method: "PATCH",
          path: "/test/801/cancel",
        });
        assert.equal(response.status, 200);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          agendaEvent: {
            findFirst: async () => ({ id: 801, branchId: 2, status: "AGENDADO" }),
            update: async () => ({ id: 801, branchId: 2, status: "CANCELADO" }),
          },
        },
        async () => {
          const response = await request((app) => app.patch("/test/:id/cancel", cancelEvent), {
            method: "PATCH",
            path: "/test/801/cancel",
          });
          assert.equal(response.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("POST /users registers USER_CREATE with safe metadata", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => null,
          create: async () => ({
            id: 901,
            username: "novo.admin",
            role: "RECEPCAO",
            branchId: 2,
            isActive: true,
            createdAt: new Date("2026-08-04T12:00:00Z"),
            branch: { name: "Dimebras" },
          }),
        },
        branch: {
          findUnique: async () => ({ id: 2 }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", createUser), {
          body: {
            username: "novo.admin",
            password: "StrongPass123",
            role: "RECEPCAO",
            branchId: 2,
          },
        });

        assert.equal(response.status, 201);
        assert.equal(calls[0].action, "USER_CREATE");
        assert.equal(calls[0].entity, "USER");
        assert.equal(calls[0].entityId, "901");
        assert.deepEqual(calls[0].metadata, {
          role: "RECEPCAO",
          branchId: 2,
          active: true,
        });
        assertNoUnsafeUserAuditData(calls[0]);
      }
    )
  );
});

test("user create failure does not audit and audit failure does not alter 201", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => ({ id: 901 }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", createUser), {
          body: {
            username: "novo.admin",
            password: "StrongPass123",
            role: "RECEPCAO",
            branchId: 2,
          },
        });
        assert.equal(response.status, 400);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          user: {
            findUnique: async () => null,
            create: async () => ({
              id: 902,
              username: "novo.admin",
              role: "ADMIN",
              branchId: 2,
              isActive: true,
              createdAt: new Date("2026-08-04T12:00:00Z"),
              branch: { name: "Dimebras" },
            }),
          },
          branch: {
            findUnique: async () => ({ id: 2 }),
          },
        },
        async () => {
          const response = await request((app) => app.post("/test", createUser), {
            body: {
              username: "novo.admin",
              password: "StrongPass123",
              role: "ADMIN",
              branchId: 2,
            },
          });
          assert.equal(response.status, 201);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("PUT /users/:id registers USER_UPDATE with change flags only", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async ({ where }) =>
            where.username
              ? null
              : {
                  id: 901,
                  username: "old.user",
                  role: "RECEPCAO",
                  branchId: 2,
                  isActive: true,
                },
          update: async () => ({
            id: 901,
            username: "new.user",
            role: "ADMIN",
            branchId: 3,
            isActive: true,
            createdAt: new Date("2026-08-04T12:00:00Z"),
            branch: { name: "Filial 3" },
          }),
        },
        branch: {
          findUnique: async () => ({ id: 3 }),
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateUser), {
          method: "PUT",
          path: "/test/901",
          body: {
            username: "new.user",
            password: "OtherPass123",
            role: "ADMIN",
            branchId: 3,
          },
        });

        assert.equal(response.status, 200);
        assert.equal(calls[0].action, "USER_UPDATE");
        assert.equal(calls[0].entity, "USER");
        assert.equal(calls[0].entityId, "901");
        assert.deepEqual(calls[0].metadata, {
          usernameChanged: true,
          roleChanged: true,
          branchChanged: true,
          credentialsChanged: true,
        });
        assertNoUnsafeUserAuditData(calls[0]);
      }
    )
  );
});

test("user update failure, no-op and audit failure preserve behavior", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateUser), {
          method: "PUT",
          path: "/test/901",
          body: { username: "new.user" },
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => ({
            id: 901,
            username: "old.user",
            role: "RECEPCAO",
            branchId: 2,
            isActive: true,
          }),
          update: async () => ({
            id: 901,
            username: "old.user",
            role: "RECEPCAO",
            branchId: 2,
            isActive: true,
            createdAt: new Date("2026-08-04T12:00:00Z"),
            branch: { name: "Dimebras" },
          }),
        },
        branch: {
          findUnique: async () => ({ id: 2 }),
        },
      },
      async () => {
        const response = await request((app) => app.put("/test/:id", updateUser), {
          method: "PUT",
          path: "/test/901",
          body: { username: "old.user", role: "RECEPCAO", branchId: 2 },
        });
        assert.equal(response.status, 200);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          user: {
            findUnique: async ({ where }) =>
              where.username
                ? null
                : {
                    id: 901,
                    username: "old.user",
                    role: "RECEPCAO",
                    branchId: 2,
                    isActive: true,
                  },
            update: async () => ({
              id: 901,
              username: "new.user",
              role: "RECEPCAO",
              branchId: 2,
              isActive: true,
              createdAt: new Date("2026-08-04T12:00:00Z"),
              branch: { name: "Dimebras" },
            }),
          },
        },
        async () => {
          const response = await request((app) => app.put("/test/:id", updateUser), {
            method: "PUT",
            path: "/test/901",
            body: { username: "new.user" },
          });
          assert.equal(response.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("user activate and deactivate audit only after confirmed status changes", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async ({ where }) =>
            where.id === 901
              ? { id: 901, username: "old.user", role: "RECEPCAO", branchId: 2, isActive: true }
              : null,
          update: async () => ({
            id: 901,
            username: "old.user",
            role: "RECEPCAO",
            branchId: 2,
            isActive: false,
            createdAt: new Date("2026-08-04T12:00:00Z"),
            branch: { name: "Dimebras" },
          }),
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/disable", disableUser), {
          method: "PATCH",
          path: "/test/901/disable",
        });

        assert.equal(response.status, 200);
        assert.equal(calls[0].action, "USER_DEACTIVATE");
        assert.equal(calls[0].entity, "USER");
        assert.equal(calls[0].entityId, "901");
        assert.deepEqual(calls[0].metadata, { active: false });
      }
    )
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => ({
            id: 901,
            username: "old.user",
            role: "RECEPCAO",
            branchId: 2,
            isActive: false,
          }),
          update: async () => ({
            id: 901,
            username: "old.user",
            role: "RECEPCAO",
            branchId: 2,
            isActive: true,
            createdAt: new Date("2026-08-04T12:00:00Z"),
            branch: { name: "Dimebras" },
          }),
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/enable", enableUser), {
          method: "PATCH",
          path: "/test/901/enable",
        });

        assert.equal(response.status, 200);
        assert.equal(calls[0].action, "USER_ACTIVATE");
        assert.equal(calls[0].entity, "USER");
        assert.equal(calls[0].entityId, "901");
        assert.deepEqual(calls[0].metadata, { active: true });
      }
    )
  );
});

test("user activate/deactivate failures, no-op and audit failure preserve behavior", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/enable", enableUser), {
          method: "PATCH",
          path: "/test/901/enable",
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        user: {
          findUnique: async () => ({
            id: 901,
            username: "old.user",
            role: "RECEPCAO",
            branchId: 2,
            isActive: true,
          }),
        },
      },
      async () => {
        const response = await request((app) => app.patch("/test/:id/enable", enableUser), {
          method: "PATCH",
          path: "/test/901/enable",
        });
        assert.equal(response.status, 200);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          user: {
            findUnique: async () => ({
              id: 901,
              username: "old.user",
              role: "RECEPCAO",
              branchId: 2,
              isActive: false,
            }),
            update: async () => ({
              id: 901,
              username: "old.user",
              role: "RECEPCAO",
              branchId: 2,
              isActive: true,
              createdAt: new Date("2026-08-04T12:00:00Z"),
              branch: { name: "Dimebras" },
            }),
          },
        },
        async () => {
          const response = await request((app) => app.patch("/test/:id/enable", enableUser), {
            method: "PATCH",
            path: "/test/901/enable",
          });
          assert.equal(response.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("successful checkin registers CHECKIN with visit id and visitorId only", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => ({
            id: 55,
            createdInBranchId: 2,
            photoBytes: Buffer.from("stored"),
            photoMime: "image/jpeg",
            photoUpdatedAt: new Date(),
            documentFrontBytes: Buffer.from("stored"),
            documentFrontMime: "image/jpeg",
            documentFrontUpdatedAt: new Date(),
            documentBackBytes: Buffer.from("stored"),
            documentBackMime: "image/jpeg",
            documentBackUpdatedAt: new Date(),
          }),
        },
        branch: {
          findUnique: async () => ({ id: 2, name: "Dimebras" }),
        },
        visit: {
          findFirst: async () => null,
          create: async () => ({ id: 201, visitorId: 55, branchId: 2, visitCode: "12345678" }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", checkin), {
          body: validCheckinBody(),
        });

        assert.equal(response.status, 201);
        assert.equal(calls[0].action, "CHECKIN");
        assert.equal(calls[0].entity, "VISIT");
        assert.equal(calls[0].entityId, "201");
        assert.deepEqual(calls[0].metadata, { visitorId: 55 });
        assertNoSensitiveAuditData(calls[0]);
      }
    )
  );
});

test("failed checkin does not audit and audit failure does not block checkin", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visitor: {
          findUnique: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", checkin), {
          body: validCheckinBody(),
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          visitor: {
            findUnique: async () => ({
              id: 55,
              createdInBranchId: 2,
              photoBytes: Buffer.from("stored"),
              photoMime: "image/jpeg",
              photoUpdatedAt: new Date(),
              documentFrontBytes: Buffer.from("stored"),
              documentFrontMime: "image/jpeg",
              documentFrontUpdatedAt: new Date(),
              documentBackBytes: Buffer.from("stored"),
              documentBackMime: "image/jpeg",
              documentBackUpdatedAt: new Date(),
            }),
          },
          branch: {
            findUnique: async () => ({ id: 2, name: "Dimebras" }),
          },
          visit: {
            findFirst: async () => null,
            create: async () => ({ id: 201, visitorId: 55, branchId: 2 }),
          },
        },
        async () => {
          const response = await request((app) => app.post("/test", checkin), {
            body: validCheckinBody(),
          });
          assert.equal(response.status, 201);
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("POST /visits/:id/label-token registers VISIT_LABEL_GENERATE with safe metadata", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => ({ id: 401, branchId: 2 }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test/:id/label-token", labelToken), {
          path: "/test/401/label-token",
        });

        assert.equal(response.status, 200);
        assert.equal(typeof response.body.token, "string");
        assert.equal(calls.length, 1);
        assert.equal(calls[0].action, "VISIT_LABEL_GENERATE");
        assert.equal(calls[0].entity, "VISIT");
        assert.equal(calls[0].entityId, "401");
        assert.equal(calls[0].branchId, 2);
        assert.equal(calls[0].description, "Etiqueta de visita gerada");
        assert.deepEqual(calls[0].metadata, { reprint: false });
        assertNoUnsafeLabelAuditData(calls[0]);
      }
    )
  );
});

test("label token failures and HTML refresh do not audit", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.post("/test/:id/label-token", labelToken), {
          path: "/test/404/label-token",
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => ({ id: 401, branchId: 3 }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test/:id/label-token", labelToken), {
          path: "/test/401/label-token",
          user: { id: 8, role: "RECEPCAO", branchId: 2 },
        });
        assert.equal(response.status, 403);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => ({
            id: 401,
            branchId: 2,
            visitCode: "12345678",
            checkinAt: new Date("2099-01-02T13:04:05.000Z"),
            attendedBy: "Maria",
            visitor: { name: "Maria", cpf: "52998224725", company: "Dimebras" },
            branch: { id: 2, name: "Dimebras" },
          }),
        },
        user: {
          findUnique: async () => ({ id: 7, role: "ADMIN", branchId: 2, isActive: true }),
        },
      },
      async () => {
        const response = await request((app) => app.get("/test/:id/label", label), {
          method: "GET",
          path: "/test/401/label",
          headers: { Authorization: "Bearer invalid-token" },
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  const validLabelToken = jwt.sign(
    { purpose: "visit-label", visitId: 401, branchId: 2 },
    process.env.JWT_SECRET,
    labelTokenSignOptions()
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => ({
            id: 401,
            branchId: 2,
            visitCode: "12345678",
            checkinAt: new Date("2099-01-02T13:04:05.000Z"),
            attendedBy: "Maria",
            visitor: { name: "Maria", cpf: "52998224725", company: "Dimebras" },
            branch: { id: 2, name: "Dimebras" },
          }),
        },
      },
      async () => {
        const response = await request((app) => app.get("/test/:id/label", label), {
          method: "GET",
          path: `/test/401/label?token=${encodeURIComponent(validLabelToken)}`,
        });
        assert.equal(response.status, 200);
        assert.equal(String(response.body).includes("<!doctype html>"), true);
        assert.equal(calls.length, 0);
      }
    )
  );

  const expiredLabelToken = jwt.sign(
    { purpose: "visit-label", visitId: 401, branchId: 2, exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET,
    {
      algorithm: labelTokenSignOptions().algorithm,
      issuer: labelTokenSignOptions().issuer,
      audience: labelTokenSignOptions().audience,
    }
  );

  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findUnique: async () => ({
            id: 401,
            branchId: 2,
            visitCode: "12345678",
            checkinAt: new Date("2099-01-02T13:04:05.000Z"),
            attendedBy: "Maria",
            visitor: { name: "Maria", cpf: "52998224725", company: "Dimebras" },
            branch: { id: 2, name: "Dimebras" },
          }),
        },
      },
      async () => {
        const response = await request((app) => app.get("/test/:id/label", label), {
          method: "GET",
          path: `/test/401/label?token=${encodeURIComponent(expiredLabelToken)}`,
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );
});

test("audit failure does not block label token generation", async () => {
  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          visit: {
            findUnique: async () => ({ id: 401, branchId: 2 }),
          },
        },
        async () => {
          const response = await request((app) => app.post("/test/:id/label-token", labelToken), {
            path: "/test/401/label-token",
          });

          assert.equal(response.status, 200);
          assert.equal(typeof response.body.token, "string");
          assert.equal(calls.length, 1);
        }
      )
  );
});

test("successful checkout registers CHECKOUT with visit id and visitorId only", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findFirst: async () => ({ id: 301, visitorId: 55, branchId: 2 }),
          update: async () => ({ id: 301, visitorId: 55, branchId: 2, checkoutAt: "now" }),
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", checkout), {
          body: { visitCode: "12345678" },
        });

        assert.equal(response.status, 200);
        assert.equal(calls[0].action, "CHECKOUT");
        assert.equal(calls[0].entity, "VISIT");
        assert.equal(calls[0].entityId, "301");
        assert.deepEqual(calls[0].metadata, { visitorId: 55 });
        assertNoSensitiveAuditData(calls[0]);
      }
    )
  );
});

test("invalid checkout does not audit and audit failure does not block checkout", async () => {
  await withAuditMock(null, (calls) =>
    withPrismaMocks(
      {
        visit: {
          findFirst: async () => null,
        },
      },
      async () => {
        const response = await request((app) => app.post("/test", checkout), {
          body: { visitCode: "12345678" },
        });
        assert.equal(response.status, 404);
        assert.equal(calls.length, 0);
      }
    )
  );

  await withAuditMock(
    async () => {
      throw new Error("audit down");
    },
    (calls) =>
      withPrismaMocks(
        {
          visit: {
            findFirst: async () => ({ id: 301, visitorId: 55, branchId: 2 }),
            update: async () => ({ id: 301, visitorId: 55, branchId: 2, checkoutAt: "now" }),
          },
        },
        async () => {
          const response = await request((app) => app.post("/test", checkout), {
            body: { visitCode: "12345678" },
          });
          assert.equal(response.status, 200);
          assert.equal(calls.length, 1);
        }
      )
  );
});
