import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { sessionJwtSignOptions, sessionJwtVerifyOptions } from "../config/auth.js";
import { LABEL_TOKEN, labelTokenSignOptions, labelTokenVerifyOptions } from "../config/labelToken.js";
import { checkin, createLabelToken, getLabelData } from "./visit.service.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

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

function labelVisit(extra = {}) {
  return {
    id: 78,
    branchId: 4,
    visitCode: "87654321",
    checkinAt: new Date("2099-01-02T13:04:05.000Z"),
    attendedBy: "Maria",
    visitor: { name: "Visitante", cpf: "52998224725", company: "Dimebras" },
    branch: { id: 4, name: "Filial B" },
    ...extra,
  };
}

function signLabelToken(payload = {}, options = {}) {
  return jwt.sign(
    { purpose: "visit-label", visitId: 78, branchId: 4, ...payload },
    process.env.JWT_SECRET,
    { ...labelTokenSignOptions(), ...options }
  );
}

async function getLabelDataWithToken(token, visit = labelVisit()) {
  return withPrismaMocks(
    {
      visit: {
        findUnique: async () => visit,
      },
    },
    () => getLabelData({ authorization: "", visitId: visit.id, labelToken: token })
  );
}

test("createLabelToken signs only the required label payload with explicit policy", async () => {
  const result = await withPrismaMocks(
    {
      visit: {
        findUnique: async () => ({ id: 78, branchId: 4 }),
      },
    },
    () => createLabelToken({ user: { id: 7, role: "RECEPCAO", branchId: 4 }, visitId: 78 })
  );

  assert.equal(result.ok, true);
  assert.equal(result.expiresInSeconds, 8 * 60 * 60);

  const decoded = jwt.decode(result.token, { complete: true });
  assert.equal(decoded.header.alg, LABEL_TOKEN.algorithm);
  assert.equal(decoded.payload.purpose, "visit-label");
  assert.equal(decoded.payload.visitId, 78);
  assert.equal(decoded.payload.branchId, 4);
  assert.equal(decoded.payload.iss, LABEL_TOKEN.issuer);
  assert.equal(decoded.payload.aud, LABEL_TOKEN.audience);
  assert.equal(decoded.payload.cpf, undefined);
  assert.equal(decoded.payload.document, undefined);
  assert.equal(decoded.payload.password, undefined);

  assert.doesNotThrow(() =>
    jwt.verify(result.token, process.env.JWT_SECRET, labelTokenVerifyOptions())
  );
});

test("getLabelData accepts a valid label token", async () => {
  const result = await getLabelDataWithToken(signLabelToken());

  assert.equal(result.ok, true);
  assert.equal(result.visit.id, 78);
});

test("getLabelData rejects expired, malformed, wrong issuer, wrong audience and disallowed algorithm label tokens", async () => {
  const expiredToken = jwt.sign(
    { purpose: "visit-label", visitId: 78, branchId: 4, exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET,
    {
      algorithm: LABEL_TOKEN.algorithm,
      issuer: LABEL_TOKEN.issuer,
      audience: LABEL_TOKEN.audience,
    }
  );
  const wrongIssuerToken = signLabelToken({}, { issuer: "wrong-label-issuer" });
  const wrongAudienceToken = signLabelToken({}, { audience: "wrong-label-audience" });
  const wrongAlgorithmToken = signLabelToken({}, { algorithm: "HS384" });

  for (const token of [
    expiredToken,
    "not-a-valid-token",
    wrongIssuerToken,
    wrongAudienceToken,
    wrongAlgorithmToken,
  ]) {
    const result = await getLabelDataWithToken(token);

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(result.message, "Visita não encontrada");
  }
});

test("getLabelData does not accept a session JWT as a label token", async () => {
  const sessionToken = jwt.sign({}, process.env.JWT_SECRET, sessionJwtSignOptions(7));
  const result = await getLabelDataWithToken(sessionToken);

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.message, "Visita não encontrada");
});

test("label token policy does not validate as a session JWT", async () => {
  const labelToken = signLabelToken();

  assert.throws(() => jwt.verify(labelToken, process.env.JWT_SECRET, sessionJwtVerifyOptions()));
});

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
