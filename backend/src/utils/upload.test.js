import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import {
  handleVisitorUploadErrors,
  handleVisitorWithFilesUpload,
  visitorUploadConfig,
  visitorWithFilesUpload,
} from "./upload.js";
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

async function sendVisitorWithFilesMultipart(parts, handler = (req, res) => {
  res.json({
    body: req.body,
    files: Object.fromEntries(
      Object.entries(req.files || {}).map(([key, files]) => [
        key,
        files.map((file) => ({
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          hasBuffer: Buffer.isBuffer(file.buffer),
          hasPath: "path" in file,
          hasDestination: "destination" in file,
          hasFilename: "filename" in file,
        })),
      ])
    ),
  });
}) {
  const app = express();
  app.post("/visitors-with-files-test", handleVisitorWithFilesUpload, handler);

  const server = app.listen(0);

  try {
    const { port } = server.address();
    const formData = new FormData();
    for (const part of parts) {
      if (part.type === "field") {
        formData.append(part.name, part.value);
      } else {
        formData.append(
          part.name,
          new File([part.bytes ?? JPEG_BYTES], part.filename, {
            type: part.mime ?? "image/jpeg",
          })
        );
      }
    }

    const response = await fetch(`http://127.0.0.1:${port}/visitors-with-files-test`, {
      method: "POST",
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

function field(name, value = "value") {
  return { type: "field", name, value };
}

function file(name, filename = `${name}.jpg`, bytes = JPEG_BYTES, mime = "image/jpeg") {
  return { type: "file", name, filename, bytes, mime };
}

function validVisitorWithFilesParts() {
  return [
    field("name", "Maria Silva"),
    field("cpf", "52998224725"),
    field("phone", "11999999999"),
    field("company", "Dimebras"),
    file("photo", "photo.jpg"),
    file("documentFront", "document-front.jpg"),
    file("documentBack", "document-back.jpg"),
  ];
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

test("visitor with files upload accepts four text fields and three valid files", async () => {
  const response = await sendVisitorWithFilesMultipart(validVisitorWithFilesParts());

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.body, {
    name: "Maria Silva",
    cpf: "52998224725",
    phone: "11999999999",
    company: "Dimebras",
  });
  assert.deepEqual(Object.keys(response.body.files).sort(), [
    "documentBack",
    "documentFront",
    "photo",
  ]);
  assert.equal(response.body.files.photo[0].originalname, "photo.jpg");
  assert.equal(response.body.files.documentFront[0].originalname, "document-front.jpg");
  assert.equal(response.body.files.documentBack[0].originalname, "document-back.jpg");
});

test("visitor with files upload keeps files in memory and does not expose disk storage fields", async () => {
  const response = await sendVisitorWithFilesMultipart(validVisitorWithFilesParts());

  assert.equal(response.status, 200);
  for (const files of Object.values(response.body.files)) {
    assert.equal(files.length, 1);
    assert.equal(files[0].hasBuffer, true);
    assert.equal(files[0].hasPath, false);
    assert.equal(files[0].hasDestination, false);
    assert.equal(files[0].hasFilename, false);
  }
});

test("visitor with files upload does not write to project disk", async () => {
  const before = new Set(fs.readdirSync(path.resolve(".")));
  const response = await sendVisitorWithFilesMultipart(validVisitorWithFilesParts());
  const after = new Set(fs.readdirSync(path.resolve(".")));

  assert.equal(response.status, 200);
  assert.deepEqual(after, before);
});

test("visitor with files upload rejects a fourth file", async () => {
  const response = await sendVisitorWithFilesMultipart([
    file("photo", "photo.jpg"),
    file("documentFront", "front.jpg"),
    file("documentBack", "back.jpg"),
    file("avatar", "avatar.jpg"),
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "UPLOAD_TOO_MANY_FILES");
  assert.equal(response.body.message, "Arquivos demais. Envie exatamente photo, documentFront e documentBack.");
});

test("visitor with files upload rejects duplicate file in the same field", async () => {
  const response = await sendVisitorWithFilesMultipart([
    file("photo", "photo.jpg"),
    file("photo", "photo-2.jpg"),
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "UPLOAD_DUPLICATE_FIELD");
  assert.equal(response.body.message, "Foi enviado mais de um arquivo para o campo de foto.");
});

test("visitor with files upload rejects unexpected file field", async () => {
  const response = await sendVisitorWithFilesMultipart([file("avatar", "avatar.jpg")]);

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "UPLOAD_UNEXPECTED_FIELD");
  assert.equal(
    response.body.message,
    "Campo de arquivo inesperado. Use apenas photo, documentFront e documentBack."
  );
});

test("visitor with files upload rejects a fifth text field", async () => {
  const response = await sendVisitorWithFilesMultipart([
    field("name", "Maria"),
    field("cpf", "52998224725"),
    field("phone", "11999999999"),
    field("company", "Dimebras"),
    field("extra", "not allowed"),
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "UPLOAD_TOO_MANY_FIELDS");
  assert.equal(response.body.message, "Campos de texto demais. Envie apenas name, cpf, phone e company.");
});

test("visitor with files upload rejects an eighth multipart part", async () => {
  const response = await sendVisitorWithFilesMultipart([
    ...validVisitorWithFilesParts(),
    field("extra", "not allowed"),
  ]);

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "UPLOAD_TOO_MANY_FIELDS");
  assert.equal(response.body.message, "Campos de texto demais. Envie apenas name, cpf, phone e company.");
});

test("visitor with files upload maps LIMIT_PART_COUNT with a distinct message", async () => {
  const originalFields = visitorWithFilesUpload.fields;
  const partLimitError = new multer.MulterError("LIMIT_PART_COUNT");
  const res = createRes();
  let responseSent;
  const responseSentPromise = new Promise((resolve) => {
    responseSent = resolve;
  });
  const originalJson = res.json;

  res.json = function json(body) {
    originalJson.call(this, body);
    responseSent();
    return this;
  };

  visitorWithFilesUpload.fields = () => (req, response, cb) => cb(partLimitError);

  try {
    handleVisitorWithFilesUpload({}, res, () => {
      throw new Error("next should not be called for handled Multer errors");
    });
    await responseSentPromise;
  } finally {
    visitorWithFilesUpload.fields = originalFields;
  }

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "UPLOAD_TOO_MANY_PARTS");
  assert.equal(
    res.body.message,
    "Partes demais no multipart. Envie apenas quatro campos de texto e tres arquivos."
  );
});

test("visitor with files upload rejects file above 8 MB", async () => {
  const response = await sendVisitorWithFilesMultipart([
    file("photo", "photo.jpg", new Uint8Array(visitorUploadConfig.limits.visitorWithFiles.fileSize + 1)),
  ]);

  assert.equal(response.status, 413);
  assert.equal(response.body.code, "UPLOAD_FILE_TOO_LARGE");
  assert.equal(response.body.message, "Arquivo excede o limite permitido.");
});

test("visitor with files upload rejects invalid MIME", async () => {
  const response = await sendVisitorWithFilesMultipart([
    file("photo", "photo.txt", JPEG_BYTES, "text/plain"),
  ]);

  assert.equal(response.status, 415);
  assert.equal(response.body.code, "UPLOAD_INVALID_TYPE");
  assert.equal(response.body.message, "Tipo de arquivo não permitido.");
});

test("visitor with files upload rejects invalid extension", async () => {
  const response = await sendVisitorWithFilesMultipart([
    file("photo", "photo.gif", JPEG_BYTES, "image/jpeg"),
  ]);

  assert.equal(response.status, 415);
  assert.equal(response.body.code, "UPLOAD_INVALID_TYPE");
  assert.equal(response.body.message, "Extensao de arquivo não permitida.");
});

test("visitor with files upload forwards unexpected errors", async () => {
  const unexpected = new Error("handler failed");
  const originalFields = visitorWithFilesUpload.fields;
  let forwardedError;

  visitorWithFilesUpload.fields = () => (req, res, cb) => cb(unexpected);

  try {
    await new Promise((resolve) => {
      handleVisitorWithFilesUpload({}, {}, (error) => {
        forwardedError = error;
        resolve();
      });
    });

    assert.equal(forwardedError, unexpected);
  } finally {
    visitorWithFilesUpload.fields = originalFields;
  }
});

test("old visitor upload still rejects text fields", async () => {
  const app = express();
  app.put("/files", handleVisitorUploadErrors, (req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const formData = new FormData();
    formData.append("name", "Maria");
    const response = await fetch(`http://127.0.0.1:${port}/files`, {
      method: "PUT",
      body: formData,
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "UPLOAD_TEXT_FIELDS_NOT_ALLOWED");
    assert.equal(body.message, "Campos de texto não são aceitos neste upload.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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
