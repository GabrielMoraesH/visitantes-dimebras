import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import AuditService from "../services/audit.service.js";
import { requestContext } from "../middlewares/requestContext.js";
import { normalizeErrorResponses, errorHandler } from "../middlewares/errorHandler.js";
import { login } from "./auth.controller.js";
import {
  createVisitor,
  createVisitorWithFiles,
  updateVisitorFiles,
} from "./visitors.controller.js";
import { checkin, checkout } from "./visits.controller.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-32-characters-safe";

const VALID_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const jpegFile = {
  originalname: "secret-document.jpg",
  mimetype: "image/jpeg",
  buffer: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
  ]),
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
    return { status: response.status, body: await response.json() };
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
