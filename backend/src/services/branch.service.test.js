import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/prisma.js";
import { listBranches } from "./branch.service.js";

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

test("listBranches uses id ascending order and returns only id and name", async () => {
  let findManyArgs;
  const branches = [
    { id: 1, name: "Dimebras PR" },
    { id: 2, name: "Alfamed MS" },
    { id: 3, name: "Dimebras MT" },
    { id: 5, name: "Dimebras MS" },
    { id: 6, name: "Dimebras SC" },
  ];

  const result = await withPrismaMocks(
    {
      branch: {
        findMany: async (args) => {
          findManyArgs = args;
          return branches;
        },
      },
    },
    () => listBranches()
  );

  assert.deepEqual(result, branches);
  assert.equal(result.some((branch) => branch.id === 4), false);
  assert.deepEqual(findManyArgs, {
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  assert.equal(findManyArgs.select.createdAt, undefined);
  assert.equal(findManyArgs.select.users, undefined);
  assert.equal(findManyArgs.select.visits, undefined);
});

test("listBranches returns an empty list normally", async () => {
  const result = await withPrismaMocks(
    {
      branch: {
        findMany: async () => [],
      },
    },
    () => listBranches()
  );

  assert.deepEqual(result, []);
});

test("listBranches propagates technical Prisma errors", async () => {
  const technicalError = new Error("database offline");

  await assert.rejects(
    withPrismaMocks(
      {
        branch: {
          findMany: async () => {
            throw technicalError;
          },
        },
      },
      () => listBranches()
    ),
    technicalError
  );
});
