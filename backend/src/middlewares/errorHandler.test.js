import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth, authorizeRoles } from "./auth.js";
import { sessionJwtSignOptions } from "../config/auth.js";
import {
  errorHandler,
  normalizeErrorResponses,
  notFoundHandler,
} from "./errorHandler.js";
import { handleVisitorUploadErrors } from "../utils/upload.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);

function prismaKnownError(code, meta = {}) {
  return new Prisma.PrismaClientKnownRequestError("Prisma internal details", {
    code,
    clientVersion: "test",
    meta,
  });
}

async function withServer(configure) {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  configure(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}/missing`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(configure, path = "/test", options = {}) {
  const app = express();
  app.use(express.json());
  app.use(normalizeErrorResponses);
  configure(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("unknown route returns standardized JSON 404", async () => {
  const response = await withServer(() => {});
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.code, "ROUTE_NOT_FOUND");
  assert.equal(body.message, "Rota n\u00e3o encontrada.");
  assert.equal(body.details, null);
});

test("unexpected error returns generic 500 without stack", async () => {
  const { status, body } = await request((app) => {
    app.get("/test", () => {
      throw new Error("SQL select * from secret_table");
    });
  });

  assert.equal(status, 500);
  assert.equal(body.message, "Erro interno");
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.details, null);
  assert.equal(JSON.stringify(body).includes("secret_table"), false);
  assert.equal(JSON.stringify(body).includes("stack"), false);
});

test("Prisma P2002 for CPF returns 409 with specific code", async () => {
  const { status, body } = await request((app) => {
    app.get("/test", (req, res, next) => next(prismaKnownError("P2002", { target: ["cpf"] })));
  });

  assert.equal(status, 409);
  assert.equal(body.code, "VISITOR_CPF_CONFLICT");
  assert.equal(body.message, "CPF j\u00e1 cadastrado");
});

test("Prisma P2002 for username returns 409 with specific code", async () => {
  const { status, body } = await request((app) => {
    app.get("/test", (req, res, next) => next(prismaKnownError("P2002", { target: ["username"] })));
  });

  assert.equal(status, 409);
  assert.equal(body.code, "USER_USERNAME_CONFLICT");
  assert.equal(body.message, "Username j\u00e1 existe");
});

test("Prisma P2025 returns safe 404", async () => {
  const { status, body } = await request((app) => {
    app.get("/test", (req, res, next) => next(prismaKnownError("P2025")));
  });

  assert.equal(status, 404);
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("Zod validation error returns standardized details", async () => {
  const schema = z.object({ email: z.string().email("E-mail invalido.") });
  const { status, body } = await request((app) => {
    app.get("/test", () => schema.parse({ email: "x" }));
  });

  assert.equal(status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.deepEqual(body.details, [{ field: "email", message: "E-mail invalido." }]);
});

test("missing token returns standardized 401", async () => {
  const { status, body } = await request((app) => {
    app.get("/test", auth, (req, res) => res.json({ ok: true }));
  });

  assert.equal(status, 401);
  assert.equal(body.code, "AUTH_REQUIRED");
});

test("expired token returns standardized 401", async () => {
  const token = jwt.sign({}, process.env.JWT_SECRET, {
    ...sessionJwtSignOptions(1),
    expiresIn: "-1s",
  });
  const { status, body } = await request(
    (app) => {
      app.get("/test", auth, (req, res) => res.json({ ok: true }));
    },
    "/test",
    { headers: { authorization: `Bearer ${token}` } }
  );

  assert.equal(status, 401);
  assert.equal(body.code, "TOKEN_EXPIRED");
});

test("authorization denied returns standardized 403", async () => {
  const { status, body } = await request((app) => {
    app.get(
      "/test",
      (req, res, next) => {
        req.user = { id: 2, role: "RECEPCAO", branchId: 1 };
        next();
      },
      authorizeRoles("ADMIN"),
      (req, res) => res.json({ ok: true })
    );
  });

  assert.equal(status, 403);
  assert.equal(body.code, "FORBIDDEN");
});

test("visitor upload above size limit returns 413", async () => {
  const bigFile = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "foto.jpg", {
    type: "image/jpeg",
  });
  const formData = new FormData();
  formData.append("photo", bigFile);

  const { status, body } = await request(
    (app) => {
      app.put("/test", handleVisitorUploadErrors, (req, res) => res.json({ ok: true }));
    },
    "/test",
    { method: "PUT", body: formData }
  );

  assert.equal(status, 413);
  assert.equal(body.code, "UPLOAD_FILE_TOO_LARGE");
});

test("visitor upload invalid type returns 415 without path", async () => {
  const formData = new FormData();
  formData.append("photo", new File([JPEG_BYTES], "foto.txt", { type: "text/plain" }));

  const { status, body } = await request(
    (app) => {
      app.put("/test", handleVisitorUploadErrors, (req, res) => res.json({ ok: true }));
    },
    "/test",
    { method: "PUT", body: formData }
  );

  assert.equal(status, 415);
  assert.equal(body.code, "UPLOAD_INVALID_TYPE");
  assert.equal(JSON.stringify(body).includes(":\\"), false);
});

test("database unavailable returns safe 503", async () => {
  const error = new Prisma.PrismaClientInitializationError("database://secret", "test");
  const { status, body } = await request((app) => {
    app.get("/test", (req, res, next) => next(error));
  });

  assert.equal(status, 503);
  assert.equal(body.code, "DATABASE_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("database://secret"), false);
});

test("headersSent delegates without sending JSON again", () => {
  const req = { method: "GET", originalUrl: "/stream" };
  const res = {
    headersSent: true,
    status() {
      throw new Error("status should not be called");
    },
    json() {
      throw new Error("json should not be called");
    },
  };
  let delegated = false;

  errorHandler(new Error("stream failed"), req, res, () => {
    delegated = true;
  });

  assert.equal(delegated, true);
});
