import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { handleVisitorUploadErrors } from "./upload.js";
import prisma from "../lib/prisma.js";
import { updateVisitorFiles } from "../controllers/visitors.controller.js";

const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

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

async function sendMultipart(parts) {
  const app = express();
  app.put("/files", handleVisitorUploadErrors, (req, res) => {
    res.json(Object.fromEntries(Object.entries(req.files || {}).map(([key, files]) => [key, files.length])));
  });

  const server = app.listen(0);

  try {
    const { port } = server.address();
    const formData = new FormData();
    for (const [field, name, bytes = JPEG_BYTES, type = "image/jpeg"] of parts) {
      formData.append(field, new File([bytes], name, { type }));
    }

    const response = await fetch(`http://127.0.0.1:${port}/files`, {
      method: "PUT",
      body: formData,
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("visitor upload accepts photo, documentFront and documentBack together", async () => {
  const response = await sendMultipart([
    ["photo", "foto.jpg"],
    ["documentFront", "frente.jpg"],
    ["documentBack", "verso.jpg"],
  ]);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    photo: 1,
    documentFront: 1,
    documentBack: 1,
  });
});

test("visitor upload rejects duplicate photo", async () => {
  const response = await sendMultipart([
    ["photo", "foto.jpg"],
    ["photo", "foto-2.jpg"],
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Foi enviado mais de um arquivo para o campo de foto.");
});

test("visitor upload rejects duplicate documentFront", async () => {
  const response = await sendMultipart([
    ["documentFront", "frente.jpg"],
    ["documentFront", "frente-2.jpg"],
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Foi enviado mais de um arquivo para o campo de documento da frente.");
});

test("visitor upload rejects duplicate documentBack", async () => {
  const response = await sendMultipart([
    ["documentBack", "verso.jpg"],
    ["documentBack", "verso-2.jpg"],
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Foi enviado mais de um arquivo para o campo de documento do verso.");
});

test("visitor upload rejects unexpected file field", async () => {
  const response = await sendMultipart([["avatar", "foto.jpg"]]);

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Campo de arquivo nao reconhecido.");
});

test("updateVisitorFiles persists all three valid files", async () => {
  const req = {
    params: { id: "10" },
    user: { id: 1, role: "RECEPCAO", branchId: 1 },
    files: {
      photo: [{ buffer: JPEG_BYTES, mimetype: "image/jpeg" }],
      documentFront: [{ buffer: JPEG_BYTES, mimetype: "image/jpeg" }],
      documentBack: [{ buffer: JPEG_BYTES, mimetype: "image/jpeg" }],
    },
  };
  const res = createRes();
  let updateData;

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => ({ id: 10, createdInBranchId: 1 }),
        update: async (args) => {
          updateData = args.data;
          return { id: 10 };
        },
      },
    },
    () => updateVisitorFiles(req, res)
  );

  assert.equal(res.statusCode, 200);
  assert.ok(updateData.photoBytes);
  assert.ok(updateData.documentFrontBytes);
  assert.ok(updateData.documentBackBytes);
});

test("updateVisitorFiles does not partially update when one file has invalid content", async () => {
  const req = {
    params: { id: "10" },
    user: { id: 1, role: "RECEPCAO", branchId: 1 },
    files: {
      photo: [{ buffer: JPEG_BYTES, mimetype: "image/jpeg" }],
      documentFront: [{ buffer: Buffer.from("not an image"), mimetype: "image/jpeg" }],
    },
  };
  const res = createRes();
  let updateCalled = false;

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => ({ id: 10, createdInBranchId: 1 }),
        update: async () => {
          updateCalled = true;
          return { id: 10 };
        },
      },
    },
    () => updateVisitorFiles(req, res)
  );

  assert.equal(res.statusCode, 415);
  assert.equal(updateCalled, false);
});
