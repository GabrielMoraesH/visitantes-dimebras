import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { sessionJwtSignOptions } from "../config/auth.js";
import {
  errorHandler,
  normalizeErrorResponses,
  notFoundHandler,
} from "../middlewares/errorHandler.js";
import visitorRoutes from "./visitors.routes.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-32-characters-safe";

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);

const VALID_BODY = {
  name: "Maria Silva",
  cpf: "529.982.247-25",
  phone: "(11) 99999-9999",
  company: "Dimebras",
};

function signSession(userId = 7) {
  return jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(userId));
}

function withPrismaMocks(mocks, fn) {
  const originals = [];

  for (const [model, methods] of Object.entries(mocks)) {
    if (model === "$transaction") {
      originals.push([model, null, prisma.$transaction]);
      prisma.$transaction = methods;
      continue;
    }

    for (const [method, replacement] of Object.entries(methods)) {
      originals.push([model, method, prisma[model][method]]);
      prisma[model][method] = replacement;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [model, method, original] of originals.reverse()) {
        if (model === "$transaction") {
          prisma.$transaction = original;
        } else {
          prisma[model][method] = original;
        }
      }
    });
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  app.use("/visitors", visitorRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

async function requestVisitors({ method = "POST", path = "/visitors/with-files", token, body } = {}) {
  const app = makeApp();
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body instanceof FormData ? headers : { ...headers, "Content-Type": "application/json" },
      body,
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function formData({ fields = VALID_BODY, files = {}, extraFields = {} } = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ ...fields, ...extraFields })) {
    form.append(name, value);
  }

  const mergedFiles = {
    photo: ["photo.jpg", JPEG_BYTES, "image/jpeg"],
    documentFront: ["document-front.jpg", JPEG_BYTES, "image/jpeg"],
    documentBack: ["document-back.jpg", JPEG_BYTES, "image/jpeg"],
    ...files,
  };

  for (const [field, value] of Object.entries(mergedFiles)) {
    if (value === null) continue;
    const [filename, bytes, mime] = value;
    form.append(field, new File([bytes], filename, { type: mime }));
  }

  return form;
}

function activeUser() {
  return {
    id: 7,
    username: "recepcao",
    role: "RECEPCAO",
    branchId: 3,
    isActive: true,
    branch: { name: "Filial Teste" },
  };
}

function mockSuccessfulCreate(capture = {}) {
  return {
    user: { findUnique: async () => activeUser() },
    $transaction: async (callback) =>
      callback({
        visitor: {
          create: async (args) => {
            capture.createArgs = args;
            const now = args.data.photoUpdatedAt;
            return {
              id: 55,
              name: args.data.name,
              cpf: args.data.cpf,
              phone: args.data.phone,
              company: args.data.company,
              photoUpdatedAt: now,
              documentFrontUpdatedAt: args.data.documentFrontUpdatedAt,
              documentBackUpdatedAt: args.data.documentBackUpdatedAt,
              createdAt: new Date("2026-07-31T12:00:00.000Z"),
            };
          },
        },
      }),
  };
}

test("POST /visitors/with-files requires authentication", async () => {
  const response = await requestVisitors({ body: formData() });

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "AUTH_REQUIRED");
});

test("POST /visitors/with-files rejects inactive authenticated user", async () => {
  const response = await withPrismaMocks(
    { user: { findUnique: async () => ({ ...activeUser(), isActive: false }) } },
    () => requestVisitors({ token: signSession(), body: formData() })
  );

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "USER_INACTIVE");
});

test("POST /visitors/with-files creates a complete visitor with trusted actor and branch", async () => {
  const capture = {};
  const response = await withPrismaMocks(mockSuccessfulCreate(capture), () =>
    requestVisitors({ token: signSession(), body: formData() })
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.id, 55);
  assert.equal(response.body.cpf, "52998224725");
  assert.equal(response.body.phone, "11999999999");
  assert.equal(JSON.stringify(response.body).includes("Bytes"), false);
  assert.equal(JSON.stringify(response.body).includes("photoBytes"), false);
  assert.equal(capture.createArgs.data.createdById, 7);
  assert.equal(capture.createArgs.data.createdInBranchId, 3);
  assert.ok(Buffer.isBuffer(capture.createArgs.data.photoBytes));
  assert.ok(Buffer.isBuffer(capture.createArgs.data.documentFrontBytes));
  assert.ok(Buffer.isBuffer(capture.createArgs.data.documentBackBytes));
});

test("POST /visitors/with-files rejects protected and extra text fields before transaction", async () => {
  let transactionCalled = false;
  const response = await withPrismaMocks(
    {
      user: { findUnique: async () => activeUser() },
      $transaction: async () => {
        transactionCalled = true;
      },
    },
    () =>
      requestVisitors({
        token: signSession(),
        body: formData({ extraFields: { branchId: "999" } }),
      })
  );

  assert.equal(response.status, 400);
  assert.equal(transactionCalled, false);
});

test("POST /visitors/with-files rejects unknown text field through strict schema", async () => {
  let transactionCalled = false;
  const response = await withPrismaMocks(
    {
      user: { findUnique: async () => activeUser() },
      $transaction: async () => {
        transactionCalled = true;
      },
    },
    () =>
      requestVisitors({
        token: signSession(),
        body: formData({
          fields: {
            name: VALID_BODY.name,
            cpf: VALID_BODY.cpf,
            phone: VALID_BODY.phone,
            role: "ADMIN",
          },
        }),
      })
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
  assert.equal(transactionCalled, false);
});

for (const field of ["photo", "documentFront", "documentBack"]) {
  test(`POST /visitors/with-files rejects missing ${field}`, async () => {
    let transactionCalled = false;
    const response = await withPrismaMocks(
      {
        user: { findUnique: async () => activeUser() },
        $transaction: async () => {
          transactionCalled = true;
        },
      },
      () =>
        requestVisitors({
          token: signSession(),
          body: formData({ files: { [field]: null } }),
        })
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VISITOR_FILES_REQUIRED");
    assert.equal(transactionCalled, false);
  });
}

test("POST /visitors/with-files rejects partial upload", async () => {
  const response = await withPrismaMocks(
    { user: { findUnique: async () => activeUser() } },
    () =>
      requestVisitors({
        token: signSession(),
        body: formData({ files: { documentBack: null } }),
      })
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "VISITOR_FILES_REQUIRED");
});

test("POST /visitors/with-files rejects invalid MIME, extension, magic bytes and large files", async () => {
  const cases = [
    {
      files: { photo: ["photo.txt", JPEG_BYTES, "text/plain"] },
      status: 415,
      code: "UPLOAD_INVALID_TYPE",
    },
    {
      files: { photo: ["photo.gif", JPEG_BYTES, "image/jpeg"] },
      status: 415,
      code: "UPLOAD_INVALID_TYPE",
    },
    {
      files: { photo: ["photo.jpg", Buffer.from("not an image"), "image/jpeg"] },
      status: 415,
      code: "UPLOAD_INVALID_TYPE",
    },
    {
      files: { photo: ["photo.jpg", new Uint8Array(8 * 1024 * 1024 + 1), "image/jpeg"] },
      status: 413,
      code: "UPLOAD_FILE_TOO_LARGE",
    },
  ];

  for (const testCase of cases) {
    let transactionCalled = false;
    const response = await withPrismaMocks(
      {
        user: { findUnique: async () => activeUser() },
        $transaction: async () => {
          transactionCalled = true;
        },
      },
      () =>
        requestVisitors({
          token: signSession(),
          body: formData({ files: testCase.files }),
        })
    );

    assert.equal(response.status, testCase.status);
    assert.equal(response.body.code, testCase.code);
    assert.equal(transactionCalled, false);
  }
});

test("POST /visitors/with-files returns existing CPF conflict and does not update visitor", async () => {
  let createCalled = false;
  const duplicateCpf = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["cpf"] },
  });

  const response = await withPrismaMocks(
    {
      user: { findUnique: async () => activeUser() },
      visitor: {
        update: async () => {
          throw new Error("must not update existing visitor");
        },
      },
      $transaction: async (callback) =>
        callback({
          visitor: {
            create: async () => {
              createCalled = true;
              throw duplicateCpf;
            },
          },
        }),
    },
    () => requestVisitors({ token: signSession(), body: formData() })
  );

  assert.equal(createCalled, true);
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "VISITOR_CPF_CONFLICT");
});

test("POST /visitors/with-files uses transaction and writes all three file timestamps", async () => {
  const capture = {};
  await withPrismaMocks(mockSuccessfulCreate(capture), () =>
    requestVisitors({ token: signSession(), body: formData() })
  );

  const data = capture.createArgs.data;
  assert.ok(data.photoUpdatedAt instanceof Date);
  assert.equal(data.photoUpdatedAt, data.documentFrontUpdatedAt);
  assert.equal(data.photoUpdatedAt, data.documentBackUpdatedAt);
});

test("POST /visitors/with-files rolls back through Prisma transaction on create failure", async () => {
  let transactionCalled = false;
  const response = await withPrismaMocks(
    {
      user: { findUnique: async () => activeUser() },
      $transaction: async (callback) => {
        transactionCalled = true;
        return callback({
          visitor: {
            create: async () => {
              throw new Error("database insert failed");
            },
          },
        });
      },
    },
    () => requestVisitors({ token: signSession(), body: formData() })
  );

  assert.equal(transactionCalled, true);
  assert.equal(response.status, 500);
  assert.equal(response.body.code, "INTERNAL_ERROR");
});

test("legacy POST /visitors still works", async () => {
  const response = await withPrismaMocks(
    {
      user: { findUnique: async () => activeUser() },
      visitor: {
        create: async (args) => ({
          id: 10,
          name: args.data.name,
          cpf: args.data.cpf,
          phone: args.data.phone,
          company: args.data.company,
          createdAt: new Date("2026-07-31T12:00:00.000Z"),
        }),
      },
    },
    () =>
      requestVisitors({
        path: "/visitors",
        token: signSession(),
        body: JSON.stringify(VALID_BODY),
      })
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.id, 10);
});

test("POST /visitors/with-files is registered before parameterized visitor routes", () => {
  const routePaths = visitorRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(routePaths.indexOf("/with-files") > -1);
  assert.ok(routePaths.indexOf("/:id") > -1);
  assert.ok(routePaths.indexOf("/with-files") < routePaths.indexOf("/:id"));
  assert.ok(routePaths.includes("/:id/files"));
});
