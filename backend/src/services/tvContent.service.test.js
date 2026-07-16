import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma.js";
import { tvTempUploadDir, tvUploadDir } from "../config/uploads.js";
import {
  createTvContent,
  deleteTvContent,
  listPublicActiveTvContents,
  listTvContents,
  toggleTvContent,
} from "./tvContent.service.js";

const PNG_BYTES = Buffer.from([
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

test("listTvContents preserves admin order, include and branch serialization", async () => {
  let findManyArgs;

  const result = await withPrismaMocks(
    {
      tvContent: {
        findMany: async (args) => {
          findManyArgs = args;
          return [
            {
              id: 1,
              title: "Banner",
              branches: [{ branch: { id: 2, name: "Filial 2" } }],
            },
          ];
        },
      },
    },
    () => listTvContents()
  );

  assert.deepEqual(findManyArgs, {
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: {
      branches: {
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { branchId: "asc" },
      },
    },
  });
  assert.deepEqual(result, [{ id: 1, title: "Banner", branches: [{ id: 2, name: "Filial 2" }] }]);
});

test("listPublicActiveTvContents rejects invalid branch before Prisma", async () => {
  let branchLookupCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        branch: {
          findUnique: async () => {
            branchLookupCalled = true;
            return { id: 1 };
          },
        },
      },
      () => listPublicActiveTvContents({ query: { branchId: "abc" } })
    ),
    { name: "ZodError" }
  );

  assert.equal(branchLookupCalled, false);
});

test("listPublicActiveTvContents preserves missing and nonexistent branch responses", async () => {
  const missing = await listPublicActiveTvContents({ query: {} });
  assert.deepEqual(missing, {
    ok: false,
    status: 400,
    message: "Filial obrigat\u00f3ria para exibi\u00e7\u00e3o da TV.",
  });

  const nonexistent = await withPrismaMocks(
    {
      branch: {
        findUnique: async () => null,
      },
    },
    () => listPublicActiveTvContents({ query: { branchId: "99" } })
  );

  assert.deepEqual(nonexistent, {
    ok: false,
    status: 404,
    message: "Filial n\u00e3o encontrada.",
  });
});

test("listPublicActiveTvContents returns only active content linked to branch with public select", async () => {
  let findManyArgs;

  const result = await withPrismaMocks(
    {
      branch: {
        findUnique: async (args) => {
          assert.deepEqual(args, { where: { id: 7 }, select: { id: true } });
          return { id: 7 };
        },
      },
      tvContent: {
        findMany: async (args) => {
          findManyArgs = args;
          return [{ id: 3, title: "TV", type: "IMAGE", fileUrl: "/uploads/tv/a.png", order: 0 }];
        },
      },
    },
    () => listPublicActiveTvContents({ query: { branchId: "7" } })
  );

  assert.deepEqual(findManyArgs, {
    where: {
      isActive: true,
      branches: {
        some: { branchId: 7 },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      fileUrl: true,
      order: true,
    },
  });
  assert.deepEqual(result, {
    ok: true,
    items: [{ id: 3, title: "TV", type: "IMAGE", fileUrl: "/uploads/tv/a.png", order: 0 }],
  });
});

test("createTvContent persists metadata from validated file and removes promoted file on database failure", async () => {
  const tempPath = path.join(tvTempUploadDir, "service-test.upload");
  const renamedFiles = [];
  const unlinkedFiles = [];
  let createData;
  const originalTransaction = prisma.$transaction;

  prisma.$transaction = async (callback) =>
    callback({
      tvContent: {
        create: async (args) => {
          createData = args.data;
          throw new Error("db fail");
        },
      },
      tvContentBranch: {
        createMany: async () => {},
      },
    });

  try {
    await assert.rejects(
      withFsMocks(
        {
          open: async () => ({
            read: async (buffer) => {
              PNG_BYTES.copy(buffer);
              return { bytesRead: PNG_BYTES.length };
            },
            close: async () => {},
          }),
          rename: async (from, to) => {
            renamedFiles.push({ from, to });
          },
          unlink: async (filePath) => {
            unlinkedFiles.push(filePath);
          },
        },
        () =>
          withPrismaMocks(
            {
              branch: {
                findMany: async () => [{ id: 1 }],
              },
            },
            () =>
              createTvContent({
                actor: { id: 9 },
                input: {
                  title: "Banner",
                  order: "4",
                  isActive: "false",
                  branchIds: "[1,1]",
                },
                file: {
                  path: tempPath,
                  originalname: "original.png",
                  mimetype: "image/png",
                  size: PNG_BYTES.length,
                },
              })
          )
      ),
      /db fail/
    );
  } finally {
    prisma.$transaction = originalTransaction;
  }

  assert.equal(createData.title, "Banner");
  assert.equal(createData.type, "IMAGE");
  assert.match(createData.fileUrl, /^\/uploads\/tv\/[0-9a-f-]{36}\.png$/);
  assert.equal(createData.fileName, "original.png");
  assert.equal(createData.mimeType, "image/png");
  assert.equal(createData.fileSize, PNG_BYTES.length);
  assert.equal(createData.order, 4);
  assert.equal(createData.isActive, false);
  assert.equal(createData.createdById, 9);
  assert.equal(Object.hasOwn(createData, "filePath"), false);
  assert.equal(renamedFiles.length, 1);
  assert.deepEqual(unlinkedFiles, [renamedFiles[0].to]);
});

test("toggleTvContent updates only isActive", async () => {
  let updateArgs;

  const result = await withPrismaMocks(
    {
      tvContent: {
        findUnique: async () => ({ id: 4, isActive: true, branches: [] }),
        update: async (args) => {
          updateArgs = args;
          return { id: 4, isActive: false };
        },
      },
    },
    () => toggleTvContent({ contentId: { id: "4" } })
  );

  assert.deepEqual(updateArgs, { where: { id: 4 }, data: { isActive: false } });
  assert.deepEqual(result, { ok: true, content: { id: 4, isActive: false, branches: [] } });
});

test("deleteTvContent ignores unsafe fileUrl paths", async () => {
  let deletedId;
  let unlinkCalled = false;

  await withFsMocks(
    {
      unlink: async () => {
        unlinkCalled = true;
      },
    },
    () =>
      withPrismaMocks(
        {
          tvContent: {
            findUnique: async () => ({
              id: 5,
              fileUrl: "/uploads/tv/../escape.png",
              branches: [],
            }),
            delete: async (args) => {
              deletedId = args.where.id;
            },
          },
        },
        () => deleteTvContent({ contentId: { id: "5" } })
      )
  );

  assert.equal(deletedId, 5);
  assert.equal(unlinkCalled, false);
}
);
