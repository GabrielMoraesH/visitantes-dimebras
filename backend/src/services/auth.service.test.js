import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { login } from "./auth.service.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

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

function withBcryptCompareMock(replacement, fn) {
  const originalCompare = bcrypt.compare;
  const calls = [];

  bcrypt.compare = async (...args) => {
    calls.push(args);
    return replacement(...args);
  };

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      bcrypt.compare = originalCompare;
    });
}

function withJwtSignMock(replacement, fn) {
  const originalSign = jwt.sign;
  const calls = [];

  jwt.sign = (...args) => {
    calls.push(args);
    return replacement(...args);
  };

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      jwt.sign = originalSign;
    });
}

const activeUser = {
  id: 7,
  username: "recepcao",
  passwordHash: "stored-hash",
  role: "RECEPCAO",
  branchId: 3,
  isActive: true,
  branch: { id: 3, name: "Dimebras SP" },
};

const invalidCredentials = {
  ok: false,
  status: 401,
  message: "Usuário ou senha inválidos",
};

test("login rejects invalid body before Prisma", async () => {
  let findUniqueCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        user: {
          findUnique: async () => {
            findUniqueCalled = true;
            return activeUser;
          },
        },
      },
      () => login({ input: { username: "ab", password: "123456", extra: true } })
    ),
    { name: "ZodError" }
  );

  assert.equal(findUniqueCalled, false);
});

test("login trims username before searching", async () => {
  let findUniqueArgs;

  await withBcryptCompareMock(
    async () => true,
    () =>
      withJwtSignMock(
        () => "signed-token",
        () =>
          withPrismaMocks(
            {
              user: {
                findUnique: async (args) => {
                  findUniqueArgs = args;
                  return activeUser;
                },
              },
            },
            () => login({ input: { username: " recepcao ", password: "123456" } })
          )
      )
  );

  assert.equal(findUniqueArgs.where.username, "recepcao");
  assert.deepEqual(findUniqueArgs.include, { branch: true });
});

test("login returns invalid credentials for missing user and skips bcrypt", async () => {
  await withBcryptCompareMock(
    async () => {
      throw new Error("compare should not run");
    },
    async (compareCalls) => {
      const result = await withPrismaMocks(
        {
          user: {
            findUnique: async () => null,
          },
        },
        () => login({ input: { username: "recepcao", password: "123456" } })
      );

      assert.deepEqual(result, invalidCredentials);
      assert.equal(compareCalls.length, 0);
    }
  );
});

test("login returns same invalid credentials for wrong password and skips JWT", async () => {
  await withBcryptCompareMock(
    async () => false,
    async () =>
      withJwtSignMock(
        () => {
          throw new Error("sign should not run");
        },
        async (signCalls) => {
          const result = await withPrismaMocks(
            {
              user: {
                findUnique: async () => activeUser,
              },
            },
            () => login({ input: { username: "recepcao", password: "wrongpass" } })
          );

          assert.deepEqual(result, invalidCredentials);
          assert.equal(signCalls.length, 0);
        }
      )
  );
});

test("login returns secure invalid credentials for inactive user", async () => {
  await withBcryptCompareMock(
    async () => {
      throw new Error("compare should not run");
    },
    async (compareCalls) =>
      withJwtSignMock(
        () => {
          throw new Error("sign should not run");
        },
        async (signCalls) => {
          const result = await withPrismaMocks(
            {
              user: {
                findUnique: async () => ({ ...activeUser, isActive: false }),
              },
            },
            () => login({ input: { username: "recepcao", password: "123456" } })
          );

          assert.deepEqual(result, invalidCredentials);
          assert.equal(compareCalls.length, 0);
          assert.equal(signCalls.length, 0);
        }
      )
  );
});

test("login returns secure invalid credentials for invalid stored role", async () => {
  await withBcryptCompareMock(
    async () => {
      throw new Error("compare should not run");
    },
    async (compareCalls) =>
      withJwtSignMock(
        () => {
          throw new Error("sign should not run");
        },
        async (signCalls) => {
          const result = await withPrismaMocks(
            {
              user: {
                findUnique: async () => ({ ...activeUser, role: "SUPPORT" }),
              },
            },
            () => login({ input: { username: "recepcao", password: "123456" } })
          );

          assert.deepEqual(result, invalidCredentials);
          assert.equal(compareCalls.length, 0);
          assert.equal(signCalls.length, 0);
        }
      )
  );
});

test("login signs JWT with the preserved payload and options", async () => {
  await withBcryptCompareMock(
    async () => true,
    (compareCalls) =>
      withJwtSignMock(
        () => "signed-token",
        async (signCalls) => {
          const result = await withPrismaMocks(
            {
              user: {
                findUnique: async () => activeUser,
              },
            },
            () => login({ input: { username: "recepcao", password: "123456" } })
          );

          assert.equal(result.ok, true);
          assert.equal(result.token, "signed-token");
          assert.deepEqual(compareCalls, [["123456", "stored-hash"]]);
          assert.deepEqual(signCalls[0], [
            {
              sub: "7",
              role: "RECEPCAO",
              branchId: 3,
              branchName: "Dimebras SP",
            },
            process.env.JWT_SECRET,
            { expiresIn: "8h" },
          ]);
        }
      )
  );
});

test("login response keeps safe user data without passwordHash", async () => {
  await withBcryptCompareMock(
    async () => true,
    () =>
      withJwtSignMock(
        () => "signed-token",
        async () => {
          const result = await withPrismaMocks(
            {
              user: {
                findUnique: async () => activeUser,
              },
            },
            () => login({ input: { username: "recepcao", password: "123456" } })
          );

          assert.deepEqual(result.user, {
            id: 7,
            username: "recepcao",
            role: "RECEPCAO",
            branch: { id: 3, name: "Dimebras SP" },
          });
          assert.equal("passwordHash" in result.user, false);
        }
      )
  );
});

test("login propagates Prisma errors", async () => {
  await assert.rejects(
    withPrismaMocks(
      {
        user: {
          findUnique: async () => {
            throw new Error("database unavailable");
          },
        },
      },
      () => login({ input: { username: "recepcao", password: "123456" } })
    ),
    /database unavailable/
  );
});

test("login propagates bcrypt errors", async () => {
  await withBcryptCompareMock(
    async () => {
      throw new Error("bcrypt failed");
    },
    async () => {
      await assert.rejects(
        withPrismaMocks(
          {
            user: {
              findUnique: async () => activeUser,
            },
          },
          () => login({ input: { username: "recepcao", password: "123456" } })
        ),
        /bcrypt failed/
      );
    }
  );
});

test("login propagates JWT errors", async () => {
  await withBcryptCompareMock(
    async () => true,
    () =>
      withJwtSignMock(
        () => {
          throw new Error("jwt failed");
        },
        async () => {
          await assert.rejects(
            withPrismaMocks(
              {
                user: {
                  findUnique: async () => activeUser,
                },
              },
              () => login({ input: { username: "recepcao", password: "123456" } })
            ),
            /jwt failed/
          );
        }
      )
  );
});
