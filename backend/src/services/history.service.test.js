import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/prisma.js";
import { listHistory } from "./history.service.js";

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

test("listHistory preserves filters, pagination, order and safe select", async () => {
  let countArgs;
  let findManyArgs;
  const items = [{ id: 1, branchName: "Filial A" }];

  const result = await withPrismaMocks(
    {
      visit: {
        count: async (args) => {
          countArgs = args;
          return 26;
        },
        findMany: async (args) => {
          findManyArgs = args;
          return items;
        },
      },
    },
    () =>
      listHistory({
        actor: { id: 1, role: "ADMIN" },
        query: {
          cpf: "123.456.789-01",
          status: "closed",
          branchName: " Filial A ",
          date: "2026-07-16",
          page: "2",
          limit: "10",
        },
      })
  );

  const expectedWhere = {
    checkoutAt: { not: null },
    visitor: { cpf: "12345678901" },
    branch: { name: "Filial A" },
    checkinAt: {
      gte: new Date("2026-07-16T00:00:00.000"),
      lte: new Date("2026-07-16T23:59:59.999"),
    },
  };

  assert.deepEqual(countArgs, { where: expectedWhere });
  assert.deepEqual(findManyArgs.where, expectedWhere);
  assert.deepEqual(findManyArgs.orderBy, { checkinAt: "desc" });
  assert.equal(findManyArgs.skip, 10);
  assert.equal(findManyArgs.take, 10);
  assert.deepEqual(findManyArgs.select, {
    id: true,
    checkinAt: true,
    checkoutAt: true,
    attendedBy: true,
    branchName: true,
    visitor: {
      select: {
        name: true,
        cpf: true,
        company: true,
      },
    },
    branch: {
      select: {
        name: true,
      },
    },
    checkinByUser: {
      select: {
        username: true,
      },
    },
    checkoutByUser: {
      select: {
        username: true,
      },
    },
  });
  assert.deepEqual(result, {
    items,
    page: 2,
    limit: 10,
    total: 26,
    totalPages: 3,
  });
});

test("listHistory preserves open status, all branch and default pagination", async () => {
  let findManyArgs;

  const result = await withPrismaMocks(
    {
      visit: {
        count: async () => 0,
        findMany: async (args) => {
          findManyArgs = args;
          return [];
        },
      },
    },
    () =>
      listHistory({
        actor: { id: 1, role: "ADMIN" },
        query: {
          status: "open",
          branchName: "all",
        },
      })
  );

  assert.deepEqual(findManyArgs.where, { checkoutAt: null });
  assert.equal(findManyArgs.skip, 0);
  assert.equal(findManyArgs.take, 25);
  assert.deepEqual(result, {
    items: [],
    page: "1",
    limit: 25,
    total: 0,
    totalPages: 1,
  });
});

test("listHistory rejects invalid query before Prisma", async () => {
  let countCalled = false;
  let findManyCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        visit: {
          count: async () => {
            countCalled = true;
            return 0;
          },
          findMany: async () => {
            findManyCalled = true;
            return [];
          },
        },
      },
      () =>
        listHistory({
          actor: { id: 1, role: "ADMIN" },
          query: { page: "-1", limit: "1000", unknown: "field" },
        })
    ),
    { name: "ZodError" }
  );

  assert.equal(countCalled, false);
  assert.equal(findManyCalled, false);
});

test("listHistory propagates technical Prisma errors", async () => {
  const technicalError = new Error("database offline");

  await assert.rejects(
    withPrismaMocks(
      {
        visit: {
          count: async () => {
            throw technicalError;
          },
          findMany: async () => [],
        },
      },
      () => listHistory({ actor: { id: 1, role: "ADMIN" }, query: {} })
    ),
    technicalError
  );
});
