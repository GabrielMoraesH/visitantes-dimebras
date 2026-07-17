import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { checkin } from "./visit.service.js";

function prismaKnownError(code, meta = {}) {
  return new Prisma.PrismaClientKnownRequestError("Prisma internal details", {
    code,
    clientVersion: "test",
    meta,
  });
}

function validVisitor(id = 55, createdInBranchId = 1) {
  return {
    id,
    createdInBranchId,
    photoBytes: Buffer.from("p"),
    photoMime: "image/jpeg",
    photoUpdatedAt: new Date(),
    documentFrontBytes: Buffer.from("f"),
    documentFrontMime: "image/jpeg",
    documentFrontUpdatedAt: new Date(),
    documentBackBytes: Buffer.from("b"),
    documentBackMime: "image/jpeg",
    documentBackUpdatedAt: new Date(),
  };
}

function validInput(extra = {}) {
  return {
    visitorId: 55,
    areaToVisit: "Recepcao",
    attendedBy: "Maria",
    serviceType: "Reuniao",
    ...extra,
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

test("checkin returns current conflict when an open visit is found before create", async () => {
  let createCalled = false;
  let visitorFinds = 0;

  const result = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? validVisitor() : { id: 55, createdInBranchId: 1 }),
      },
      branch: {
        findUnique: async () => ({ id: 1, name: "Filial A" }),
      },
      visit: {
        findFirst: async () => ({ id: 99 }),
        create: async () => {
          createCalled = true;
        },
      },
    },
    () => checkin({ user: { id: 7, role: "RECEPCAO", branchId: 1 }, input: validInput() })
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.message, "Visitante já possui visita em andamento.");
  assert.equal(createCalled, false);
});

test("checkin creates a visit using the authenticated user's branch", async () => {
  let createArgs;
  let visitorFinds = 0;

  const result = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? validVisitor(55, 2) : { id: 55, createdInBranchId: 2 }),
      },
      branch: {
        findUnique: async (args) => {
          assert.equal(args.where.id, 2);
          return { id: 2, name: "Filial B" };
        },
      },
      visit: {
        findFirst: async () => null,
        create: async (args) => {
          createArgs = args;
          return { id: 10, ...args.data };
        },
      },
    },
    () => checkin({ user: { id: 7, role: "ADMIN", branchId: 2 }, input: validInput() })
  );

  assert.equal(result.ok, true);
  assert.equal(createArgs.data.branchId, 2);
  assert.equal(createArgs.data.branchName, "Filial B");
  assert.equal(createArgs.data.checkinByUserId, 7);
});

test("checkin translates open-visit unique index P2002 into the current conflict", async () => {
  let visitorFinds = 0;

  const result = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? validVisitor() : { id: 55, createdInBranchId: 1 }),
      },
      branch: {
        findUnique: async () => ({ id: 1, name: "Filial A" }),
      },
      visit: {
        findFirst: async () => null,
        create: async () => {
          throw prismaKnownError("P2002", {
            target: "visits_one_open_per_visitor_branch_idx",
          });
        },
      },
    },
    () => checkin({ user: { id: 7, role: "RECEPCAO", branchId: 1 }, input: validInput() })
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.message, "Visitante já possui visita em andamento.");
});

test("checkin translates open-visit constraint metadata into the current conflict", async () => {
  let visitorFinds = 0;

  const result = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? validVisitor() : { id: 55, createdInBranchId: 1 }),
      },
      branch: {
        findUnique: async () => ({ id: 1, name: "Filial A" }),
      },
      visit: {
        findFirst: async () => null,
        create: async () => {
          throw prismaKnownError("P2002", {
            constraint: "visits_one_open_per_visitor_branch_idx",
          });
        },
      },
    },
    () => checkin({ user: { id: 7, role: "RECEPCAO", branchId: 1 }, input: validInput() })
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.message, "Visitante já possui visita em andamento.");
});

test("checkin does not confuse visitCode unique errors with open-visit conflicts", async () => {
  let visitorFinds = 0;
  const error = prismaKnownError("P2002", { target: ["visitCode"] });

  await assert.rejects(
    () =>
      withPrismaMocks(
        {
          visitor: {
            findUnique: async () => (++visitorFinds === 1 ? validVisitor() : { id: 55, createdInBranchId: 1 }),
          },
          branch: {
            findUnique: async () => ({ id: 1, name: "Filial A" }),
          },
          visit: {
            findFirst: async () => null,
            create: async () => {
              throw error;
            },
          },
        },
        () => checkin({ user: { id: 7, role: "RECEPCAO", branchId: 1 }, input: validInput() })
      ),
    error
  );
});

test("checkin propagates unknown P2002 errors", async () => {
  let visitorFinds = 0;
  const error = prismaKnownError("P2002", { target: ["unexpectedUnique"] });

  await assert.rejects(
    () =>
      withPrismaMocks(
        {
          visitor: {
            findUnique: async () => (++visitorFinds === 1 ? validVisitor() : { id: 55, createdInBranchId: 1 }),
          },
          branch: {
            findUnique: async () => ({ id: 1, name: "Filial A" }),
          },
          visit: {
            findFirst: async () => null,
            create: async () => {
              throw error;
            },
          },
        },
        () => checkin({ user: { id: 7, role: "RECEPCAO", branchId: 1 }, input: validInput() })
      ),
    error
  );
});

test("checkin propagates unknown Prisma errors", async () => {
  let visitorFinds = 0;
  const error = prismaKnownError("P2003", { field_name: "visitorId" });

  await assert.rejects(
    () =>
      withPrismaMocks(
        {
          visitor: {
            findUnique: async () => (++visitorFinds === 1 ? validVisitor() : { id: 55, createdInBranchId: 1 }),
          },
          branch: {
            findUnique: async () => ({ id: 1, name: "Filial A" }),
          },
          visit: {
            findFirst: async () => null,
            create: async () => {
              throw error;
            },
          },
        },
        () => checkin({ user: { id: 7, role: "RECEPCAO", branchId: 1 }, input: validInput() })
      ),
    error
  );
});

test("checkin rejects branchId from body before selecting a branch or creating", async () => {
  let branchFindCalled = false;
  let createCalled = false;

  await assert.rejects(
    () =>
      withPrismaMocks(
        {
          branch: {
            findUnique: async () => {
              branchFindCalled = true;
            },
          },
          visit: {
            create: async () => {
              createCalled = true;
            },
          },
        },
        () =>
          checkin({
            user: { id: 7, role: "RECEPCAO", branchId: 1 },
            input: validInput({ branchId: 999 }),
          })
      ),
    { name: "ZodError" }
  );

  assert.equal(branchFindCalled, false);
  assert.equal(createCalled, false);
});

test("checkin does not create when visitor is outside the user's access", async () => {
  let createCalled = false;
  let visitorFinds = 0;

  const result = await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => (++visitorFinds === 1 ? validVisitor(55, 2) : { id: 55, createdInBranchId: 2 }),
      },
      visit: {
        findFirst: async () => null,
        create: async () => {
          createCalled = true;
        },
      },
    },
    () => checkin({ user: { id: 7, role: "RECEPCAO", branchId: 1 }, input: validInput() })
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(createCalled, false);
});
