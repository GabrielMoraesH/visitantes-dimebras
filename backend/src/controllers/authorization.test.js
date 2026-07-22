import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { sessionJwtSignOptions } from "../config/auth.js";
import { getByCpf, updateVisitor } from "./visitors.controller.js";
import { checkin, checkout, getVisitById, label } from "./visits.controller.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    sent: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.sent = body;
      return this;
    },
    end() {
      this.ended = true;
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

test("RECEPCAO cannot access visitor from another branch by CPF", async () => {
  const req = {
    params: { cpf: "12345678901" },
    user: { id: 10, role: "RECEPCAO", branchId: 1 },
  };
  const res = createRes();
  let visitorFinds = 0;

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => {
          visitorFinds += 1;
          return visitorFinds === 1
            ? { id: 55, cpf: "12345678901", name: "Visitante B" }
            : { id: 55, createdInBranchId: 2 };
        },
      },
      visit: {
        findFirst: async () => null,
      },
    },
    () => getByCpf(req, res)
  );

  assert.equal(res.statusCode, 404);
});

test("RECEPCAO cannot edit visitor from another branch by ID", async () => {
  const req = {
    params: { id: "55" },
    body: { company: "Nova" },
    user: { id: 10, role: "RECEPCAO", branchId: 1 },
  };
  const res = createRes();
  let updated = false;

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => ({ id: 55, createdInBranchId: 2 }),
        update: async () => {
          updated = true;
          return {};
        },
      },
      visit: {
        findFirst: async () => null,
      },
    },
    () => updateVisitor(req, res)
  );

  assert.equal(res.statusCode, 404);
  assert.equal(updated, false);
});

test("RECEPCAO cannot check in visitor without branch access", async () => {
  const req = {
    body: {
      visitorId: 55,
      areaToVisit: "Recepcao",
      attendedBy: "Maria",
      serviceType: "Reuniao",
    },
    user: { id: 10, role: "RECEPCAO", branchId: 1 },
  };
  const res = createRes();
  let created = false;
  let visitorFinds = 0;

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => {
          visitorFinds += 1;
          return visitorFinds === 1
            ? {
                id: 55,
                photoBytes: Buffer.from("p"),
                photoMime: "image/jpeg",
                photoUpdatedAt: new Date(),
                documentFrontBytes: Buffer.from("f"),
                documentFrontMime: "image/jpeg",
                documentFrontUpdatedAt: new Date(),
                documentBackBytes: Buffer.from("b"),
                documentBackMime: "image/jpeg",
                documentBackUpdatedAt: new Date(),
              }
            : { id: 55, createdInBranchId: 2 };
        },
      },
      visit: {
        findFirst: async () => null,
        create: async () => {
          created = true;
          return {};
        },
      },
      branch: {
        findUnique: async () => ({ id: 1, name: "Filial A" }),
      },
    },
    () => checkin(req, res)
  );

  assert.equal(res.statusCode, 404);
  assert.equal(created, false);
});

test("checkout uses authenticated user's branch and does not checkout another branch", async () => {
  const req = {
    body: { visitCode: "12345678" },
    user: { id: 10, role: "RECEPCAO", branchId: 1 },
  };
  const res = createRes();
  let searchedBranchId;
  let updated = false;

  await withPrismaMocks(
    {
      visit: {
        findFirst: async (args) => {
          searchedBranchId = args.where.branchId;
          return null;
        },
        update: async () => {
          updated = true;
          return {};
        },
      },
    },
    () => checkout(req, res)
  );

  assert.equal(searchedBranchId, 1);
  assert.equal(res.statusCode, 404);
  assert.equal(updated, false);
});

test("RECEPCAO cannot access visit details from another branch by ID", async () => {
  const req = {
    params: { id: "99" },
    user: { id: 10, role: "RECEPCAO", branchId: 1 },
  };
  const res = createRes();

  await withPrismaMocks(
    {
      visit: {
        findUnique: async () => ({
          id: 99,
          branchId: 2,
          branch: { id: 2, name: "Filial B" },
          visitor: { id: 55, name: "Visitante B" },
        }),
      },
    },
    () => getVisitById(req, res)
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "Visita não encontrada");
});

test("checkin rejects protected branchId from body before creating visit", async () => {
  const req = {
    body: {
      visitorId: 55,
      branchId: 2,
      areaToVisit: "Recepcao",
      attendedBy: "Maria",
      serviceType: "Reuniao",
    },
    user: { id: 10, role: "RECEPCAO", branchId: 1 },
  };
  const res = createRes();
  let created = false;
  let forwardedError;

  await withPrismaMocks(
    {
      visit: {
        create: async () => {
          created = true;
          return {};
        },
      },
    },
    () => checkin(req, res, (error) => {
      forwardedError = error;
    })
  );

  assert.equal(forwardedError?.name, "ZodError");
  assert.equal(created, false);
});

test("ADMIN can access visitor by CPF", async () => {
  const req = {
    params: { cpf: "12345678901" },
    user: { id: 1, role: "ADMIN", branchId: 1 },
  };
  const res = createRes();

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async (args) => {
          if (args.select?.createdInBranchId) return { id: 55, createdInBranchId: 2 };
          return { id: 55, cpf: "12345678901", name: "Visitante B" };
        },
      },
    },
    () => getByCpf(req, res)
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 55);
});

test("inactive user cannot access label with Bearer token", async () => {
  const token = jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(10));
  const req = {
    params: { id: "99" },
    query: {},
    headers: { authorization: `Bearer ${token}` },
  };
  const res = createRes();

  await withPrismaMocks(
    {
      visit: {
        findUnique: async () => ({
          id: 99,
          branchId: 1,
          visitCode: "12345678",
          checkinAt: new Date(),
          attendedBy: "Maria",
          visitor: { name: "Visitante", cpf: "12345678901", company: "Empresa" },
          branch: { id: 1, name: "Filial A" },
        }),
      },
      user: {
        findUnique: async () => ({
          id: 10,
          role: "RECEPCAO",
          branchId: 1,
          isActive: false,
        }),
      },
    },
    () => label(req, res)
  );

  assert.equal(res.statusCode, 404);
});

test("updateVisitor rejects protected fields from body", async () => {
  const req = {
    params: { id: "55" },
    body: {
      company: "Nova",
      phone: "(45) 99999-9999",
      createdInBranchId: 2,
      createdById: 99,
      cpf: "00000000000",
    },
    user: { id: 10, role: "RECEPCAO", branchId: 1 },
  };
  const res = createRes();
  let updateCalled = false;
  let forwardedError;

  await withPrismaMocks(
    {
      visitor: {
        findUnique: async () => ({ id: 55, createdInBranchId: 1 }),
        update: async () => {
          updateCalled = true;
          return {};
        },
      },
    },
    () => updateVisitor(req, res, (error) => {
      forwardedError = error;
    })
  );

  assert.equal(forwardedError?.name, "ZodError");
  assert.equal(updateCalled, false);
});
