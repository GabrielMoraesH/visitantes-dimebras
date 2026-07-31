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

function makeUpdateVisitorFilesReq(files) {
  return {
    params: { id: "10" },
    user: { id: 1, role: "RECEPCAO", branchId: 1 },
    files,
  };
}

function validVisitorFiles(overrides = {}) {
  return {
    photo: [{ buffer: JPEG_BYTES, mimetype: "image/jpeg" }],
    documentFront: [{ buffer: JPEG_BYTES, mimetype: "image/jpeg" }],
    documentBack: [{ buffer: JPEG_BYTES, mimetype: "image/jpeg" }],
    ...overrides,
  };
}

const emptyStoredVisitorFiles = {
  photoBytes: null,
  photoMime: null,
  documentFrontBytes: null,
  documentFrontMime: null,
  documentBackBytes: null,
  documentBackMime: null,
};

const completeStoredVisitorFiles = {
  photoBytes: Buffer.from("stored photo"),
  photoMime: "image/jpeg",
  documentFrontBytes: Buffer.from("stored front"),
  documentFrontMime: "image/jpeg",
  documentBackBytes: Buffer.from("stored back"),
  documentBackMime: "image/jpeg",
};

async function callUpdateVisitorFiles(req, storedVisitorFiles = emptyStoredVisitorFiles) {
  const res = createRes();
  let updateCalled = false;
  let updateData;

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async (args) => {
          if (args.select?.photoBytes) return storedVisitorFiles;
          return { id: 10, createdInBranchId: 1 };
        },
        update: async (args) => {
          updateCalled = true;
          updateData = args.data;
          return { id: 10 };
        },
      },
    },
    () => updateVisitorFiles(req, res)
  );

  return { res, updateCalled, updateData };
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
  assert.equal(response.body.message, "Campo de arquivo não reconhecido.");
});

const partialUploadCases = [
  {
    name: "only photo",
    files: validVisitorFiles({ documentFront: undefined, documentBack: undefined }),
    missing: "documentFront, documentBack",
  },
  {
    name: "only documentFront",
    files: validVisitorFiles({ photo: undefined, documentBack: undefined }),
    missing: "photo, documentBack",
  },
  {
    name: "only documentBack",
    files: validVisitorFiles({ photo: undefined, documentFront: undefined }),
    missing: "photo, documentFront",
  },
  {
    name: "photo and documentFront",
    files: validVisitorFiles({ documentBack: undefined }),
    missing: "documentBack",
  },
  {
    name: "photo and documentBack",
    files: validVisitorFiles({ documentFront: undefined }),
    missing: "documentFront",
  },
  {
    name: "documentFront and documentBack",
    files: validVisitorFiles({ photo: undefined }),
    missing: "photo",
  },
];

for (const { name, files, missing } of partialUploadCases) {
  test(`updateVisitorFiles rejects partial upload with ${name}`, async () => {
    const { res, updateCalled } = await callUpdateVisitorFiles(makeUpdateVisitorFilesReq(files));

    assert.equal(res.statusCode, 400);
    assert.equal(
      res.body.message,
      `Faltam arquivos obrigat\u00f3rios: ${missing}. Envie photo, documentFront e documentBack na mesma requisi\u00e7\u00e3o.`
    );
    assert.equal(updateCalled, false);
  });
}

test("updateVisitorFiles rejects upload with no files", async () => {
  const { res, updateCalled } = await callUpdateVisitorFiles(makeUpdateVisitorFilesReq(undefined));

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Envie ao menos um arquivo para atualizar.");
  assert.equal(updateCalled, false);
});

test("updateVisitorFiles persists all three valid files", async () => {
  const { res, updateData } = await callUpdateVisitorFiles(
    makeUpdateVisitorFilesReq(validVisitorFiles())
  );

  assert.equal(res.statusCode, 200);
  assert.ok(updateData.photoBytes);
  assert.ok(updateData.documentFrontBytes);
  assert.ok(updateData.documentBackBytes);
});

test("updateVisitorFiles allows partial update when visitor already has all files", async () => {
  const { res, updateData } = await callUpdateVisitorFiles(
    makeUpdateVisitorFilesReq(validVisitorFiles({ documentFront: undefined, documentBack: undefined })),
    completeStoredVisitorFiles
  );

  assert.equal(res.statusCode, 200);
  assert.ok(updateData.photoBytes);
  assert.equal("documentFrontBytes" in updateData, false);
  assert.equal("documentBackBytes" in updateData, false);
});

test("updateVisitorFiles rejects partial update when visitor files are inconsistent", async () => {
  const inconsistentStoredVisitorFiles = {
    ...emptyStoredVisitorFiles,
    photoBytes: Buffer.from("stored photo"),
    photoMime: "image/jpeg",
  };

  const { res, updateCalled } = await callUpdateVisitorFiles(
    makeUpdateVisitorFilesReq(validVisitorFiles({ documentBack: undefined })),
    inconsistentStoredVisitorFiles
  );

  assert.equal(res.statusCode, 400);
  assert.equal(
    res.body.message,
    "Cadastro do visitante est\u00e1 inconsistente. Envie photo, documentFront e documentBack na mesma requisi\u00e7\u00e3o para regularizar."
  );
  assert.equal(updateCalled, false);
});

test("updateVisitorFiles allows complete upload to regularize inconsistent visitor files", async () => {
  const inconsistentStoredVisitorFiles = {
    ...emptyStoredVisitorFiles,
    photoBytes: Buffer.from("stored photo"),
    photoMime: "image/jpeg",
  };

  const { res, updateData } = await callUpdateVisitorFiles(
    makeUpdateVisitorFilesReq(validVisitorFiles()),
    inconsistentStoredVisitorFiles
  );

  assert.equal(res.statusCode, 200);
  assert.ok(updateData.photoBytes);
  assert.ok(updateData.documentFrontBytes);
  assert.ok(updateData.documentBackBytes);
});

test("updateVisitorFiles does not partially update when one file has invalid content", async () => {
  const { res, updateCalled } = await callUpdateVisitorFiles(
    makeUpdateVisitorFilesReq(
      validVisitorFiles({
        documentFront: [{ buffer: Buffer.from("not an image"), mimetype: "image/jpeg" }],
      })
    )
  );

  assert.equal(res.statusCode, 415);
  assert.equal(updateCalled, false);
});
