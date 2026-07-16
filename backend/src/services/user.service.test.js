import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import {
  createUser,
  disableUser,
  enableUser,
  listUsers,
  updateUser,
} from "./user.service.js";

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

function withBcryptHashMock(replacement, fn) {
  const originalHash = bcrypt.hash;
  const calls = [];

  bcrypt.hash = async (...args) => {
    calls.push(args);
    return replacement(...args);
  };

  return Promise.resolve()
    .then(() => fn(calls))
    .finally(() => {
      bcrypt.hash = originalHash;
    });
}

const safeUser = {
  id: 2,
  username: "recepcao",
  role: "RECEPCAO",
  branchId: 1,
  isActive: true,
  createdAt: new Date("2026-07-16T12:00:00Z"),
  branch: { name: "Dimebras PR" },
};

test("listUsers uses id ascending order and safe select without passwordHash", async () => {
  let findManyArgs;

  const users = await withPrismaMocks(
    {
      user: {
        findMany: async (args) => {
          findManyArgs = args;
          return [safeUser];
        },
      },
    },
    () => listUsers()
  );

  assert.deepEqual(users, [safeUser]);
  assert.deepEqual(findManyArgs.orderBy, { id: "asc" });
  assert.equal(findManyArgs.select.passwordHash, undefined);
  assert.equal(findManyArgs.select.password, undefined);
  assert.equal(findManyArgs.select.username, true);
  assert.deepEqual(findManyArgs.select.branch, { select: { name: true } });
});

test("createUser rejects protected client fields before Prisma", async () => {
  let findUniqueCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        user: {
          findUnique: async () => {
            findUniqueCalled = true;
            return null;
          },
        },
      },
      () =>
        createUser({
          input: {
            id: 99,
            username: "novo",
            password: "123456",
            role: "ADMIN",
            branchId: 1,
            passwordHash: "ready-made",
            isActive: false,
          },
        })
    ),
    { name: "ZodError" }
  );

  assert.equal(findUniqueCalled, false);
});

test("createUser rejects invalid input before hash and Prisma", async () => {
  let findUniqueCalled = false;

  await withBcryptHashMock(
    async () => {
      throw new Error("hash should not run");
    },
    async (hashCalls) => {
      await assert.rejects(
        withPrismaMocks(
          {
            user: {
              findUnique: async () => {
                findUniqueCalled = true;
                return null;
              },
            },
          },
          () =>
            createUser({
              input: {
                username: "recepcao",
                password: "x".repeat(129),
                role: "RECEPCAO",
                branchId: 1,
              },
            })
        ),
        { name: "ZodError" }
      );
      assert.equal(hashCalls.length, 0);
    }
  );

  assert.equal(findUniqueCalled, false);
});

test("createUser hashes password, persists only allowed fields and returns safe select", async () => {
  let createArgs;

  const result = await withPrismaMocks(
    {
      user: {
        findUnique: async () => null,
        create: async (args) => {
          createArgs = args;
          return safeUser;
        },
      },
      branch: {
        findUnique: async () => ({ id: 1 }),
      },
    },
    () =>
      createUser({
        input: {
          username: "recepcao",
          password: "123456",
          role: "RECEPCAO",
          branchId: 1,
        },
      })
  );

  assert.equal(result.ok, true);
  assert.equal(await bcrypt.compare("123456", createArgs.data.passwordHash), true);
  assert.deepEqual(Object.keys(createArgs.data).sort(), [
    "branchId",
    "isActive",
    "passwordHash",
    "role",
    "username",
  ]);
  assert.equal(createArgs.data.password, undefined);
  assert.equal(createArgs.select.passwordHash, undefined);
  assert.deepEqual(result.user, safeUser);
});

test("createUser returns current duplicate username conflict without creating", async () => {
  let createCalled = false;

  const result = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ id: 2 }),
        create: async () => {
          createCalled = true;
          return safeUser;
        },
      },
    },
    () =>
      createUser({
        input: { username: "recepcao", password: "123456", role: "RECEPCAO", branchId: 1 },
      })
  );

  assert.deepEqual(result, { ok: false, status: 400, message: "Usuário já existe" });
  assert.equal(createCalled, false);
});

test("invalid role and missing branch are rejected before create", async () => {
  let createCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        user: {
          create: async () => {
            createCalled = true;
            return safeUser;
          },
        },
      },
      () =>
        createUser({
          input: { username: "recepcao", password: "123456", role: "INVALIDO", branchId: 1 },
        })
    ),
    { name: "ZodError" }
  );
  assert.equal(createCalled, false);

  const missingBranch = await withPrismaMocks(
    {
      user: {
        findUnique: async () => null,
        create: async () => {
          createCalled = true;
          return safeUser;
        },
      },
      branch: {
        findUnique: async () => null,
      },
    },
    () =>
      createUser({
        input: { username: "recepcao", password: "123456", role: "RECEPCAO", branchId: 999 },
      })
  );

  assert.deepEqual(missingBranch, { ok: false, status: 400, message: "Filial (branchId) não existe" });
  assert.equal(createCalled, false);
});

test("updateUser without password preserves passwordHash and uses safe select", async () => {
  let updateArgs;

  const result = await withBcryptHashMock(
    async () => {
      throw new Error("hash should not run");
    },
    async (hashCalls) => {
      const serviceResult = await withPrismaMocks(
        {
          user: {
            findUnique: async ({ where }) => (where.username ? null : { ...safeUser, passwordHash: "old" }),
            update: async (args) => {
              updateArgs = args;
              return { ...safeUser, username: "novo" };
            },
          },
          branch: {
            findUnique: async () => ({ id: 1 }),
          },
        },
        () =>
          updateUser({
            userId: { id: "2" },
            input: { username: "novo", role: "ADMIN", branchId: 1 },
          })
      );

      assert.equal(hashCalls.length, 0);
      return serviceResult;
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(updateArgs.data, { username: "novo", role: "ADMIN", branchId: 1 });
  assert.equal(updateArgs.data.passwordHash, undefined);
  assert.equal(updateArgs.select.passwordHash, undefined);
});

test("updateUser with password creates a new hash", async () => {
  let updateArgs;

  await withBcryptHashMock(
    async () => "new-hash",
    async (hashCalls) => {
      await withPrismaMocks(
        {
          user: {
            findUnique: async () => ({ ...safeUser, passwordHash: "old" }),
            update: async (args) => {
              updateArgs = args;
              return safeUser;
            },
          },
        },
        () =>
          updateUser({
            userId: { id: "2" },
            input: { password: "abcdef" },
          })
      );

      assert.deepEqual(hashCalls, [["abcdef", 10]]);
    }
  );

  assert.equal(updateArgs.data.passwordHash, "new-hash");
});

test("updateUser rejects empty password, passwordHash and unknown fields before Prisma", async () => {
  for (const input of [
    { password: "" },
    { passwordHash: "client-hash" },
    { unknown: true },
  ]) {
    let findUniqueCalled = false;

    await withBcryptHashMock(
      async () => {
        throw new Error("hash should not run");
      },
      async (hashCalls) => {
        await assert.rejects(
          withPrismaMocks(
            {
              user: {
                findUnique: async () => {
                  findUniqueCalled = true;
                  return safeUser;
                },
              },
            },
            () => updateUser({ userId: { id: "2" }, input })
          ),
          { name: "ZodError" }
        );
        assert.equal(hashCalls.length, 0);
      }
    );

    assert.equal(findUniqueCalled, false);
  }
});

test("updateUser preserves ADMIN id=1 password-only rule", async () => {
  const otherFields = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ ...safeUser, id: 1, role: "ADMIN" }),
      },
    },
    () => updateUser({ userId: { id: "1" }, input: { username: "admin2" } })
  );
  assert.deepEqual(otherFields, {
    ok: false,
    status: 400,
    message: "No ADMIN (id=1) só é permitido alterar a senha",
  });

  const missingPassword = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ ...safeUser, id: 1, role: "ADMIN" }),
      },
    },
    () => updateUser({ userId: { id: "1" }, input: {} })
  );
  assert.deepEqual(missingPassword, {
    ok: false,
    status: 400,
    message: "Informe a nova senha do ADMIN",
  });

  let updateArgs;
  const result = await withBcryptHashMock(
    async () => "admin-hash",
    async (hashCalls) => {
      const serviceResult = await withPrismaMocks(
        {
          user: {
            findUnique: async () => ({ ...safeUser, id: 1, role: "ADMIN" }),
            update: async (args) => {
              updateArgs = args;
              return { ...safeUser, id: 1, role: "ADMIN" };
            },
          },
        },
        () => updateUser({ userId: { id: "1" }, input: { password: "abcdef" } })
      );

      assert.deepEqual(hashCalls, [["abcdef", 10]]);
      return serviceResult;
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(updateArgs.data, { passwordHash: "admin-hash" });
});

test("bcrypt errors are propagated without updating user", async () => {
  let updateCalled = false;

  await assert.rejects(
    withBcryptHashMock(
      async () => {
        throw new Error("bcrypt failed");
      },
      () =>
        withPrismaMocks(
          {
            user: {
              findUnique: async () => safeUser,
              update: async () => {
                updateCalled = true;
                return safeUser;
              },
            },
          },
          () => updateUser({ userId: { id: "2" }, input: { password: "abcdef" } })
        )
    ),
    /bcrypt failed/
  );

  assert.equal(updateCalled, false);
});

test("updateUser preserves not-found, duplicate username and empty update behavior", async () => {
  const notFound = await withPrismaMocks(
    {
      user: {
        findUnique: async () => null,
      },
    },
    () => updateUser({ userId: { id: "404" }, input: { username: "novo" } })
  );
  assert.deepEqual(notFound, { ok: false, status: 404, message: "Usuário não encontrado" });

  const duplicate = await withPrismaMocks(
    {
      user: {
        findUnique: async ({ where }) => (where.username ? { id: 3 } : safeUser),
      },
    },
    () => updateUser({ userId: { id: "2" }, input: { username: "outro" } })
  );
  assert.deepEqual(duplicate, { ok: false, status: 400, message: "Username já existe" });

  const empty = await withPrismaMocks(
    {
      user: {
        findUnique: async () => safeUser,
      },
    },
    () => updateUser({ userId: { id: "2" }, input: {} })
  );
  assert.deepEqual(empty, { ok: false, status: 400, message: "Nada para atualizar" });
});

test("disableUser and enableUser change only isActive when needed", async () => {
  const updates = [];

  const disabled = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ ...safeUser, isActive: true }),
        update: async (args) => {
          updates.push(args);
          return { ...safeUser, isActive: false };
        },
      },
    },
    () => disableUser({ actor: { id: 9 }, userId: { id: "2" } })
  );
  assert.deepEqual(disabled, { ok: true });
  assert.deepEqual(updates.at(-1), { where: { id: 2 }, data: { isActive: false } });

  const enabled = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ ...safeUser, isActive: false }),
        update: async (args) => {
          updates.push(args);
          return { ...safeUser, isActive: true };
        },
      },
    },
    () => enableUser({ actor: { id: 9 }, userId: { id: "2" } })
  );
  assert.deepEqual(enabled, { ok: true });
  assert.deepEqual(updates.at(-1), { where: { id: 2 }, data: { isActive: true } });
});

test("disableUser preserves admin, self-disable, already inactive and not-found behavior", async () => {
  assert.deepEqual(await disableUser({ actor: { id: 9 }, userId: { id: "1" } }), {
    ok: false,
    status: 400,
    message: "Não é permitido desativar o ADMIN (id=1)",
  });

  assert.deepEqual(await disableUser({ actor: { id: 2 }, userId: { id: "2" } }), {
    ok: false,
    status: 400,
    message: "Você não pode desativar seu próprio usuário",
  });

  let updateCalled = false;
  const inactive = await withPrismaMocks(
    {
      user: {
        findUnique: async () => ({ ...safeUser, isActive: false }),
        update: async () => {
          updateCalled = true;
        },
      },
    },
    () => disableUser({ actor: { id: 9 }, userId: { id: "2" } })
  );
  assert.deepEqual(inactive, { ok: true });
  assert.equal(updateCalled, false);

  const notFound = await withPrismaMocks(
    {
      user: {
        findUnique: async () => null,
      },
    },
    () => disableUser({ actor: { id: 9 }, userId: { id: "2" } })
  );
  assert.deepEqual(notFound, { ok: false, status: 404, message: "Usuário não encontrado" });
});

test("invalid user id is rejected before Prisma and Prisma errors are propagated", async () => {
  let findUniqueCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        user: {
          findUnique: async () => {
            findUniqueCalled = true;
            return safeUser;
          },
        },
      },
      () => updateUser({ userId: { id: "abc" }, input: { username: "novo" } })
    ),
    { name: "ZodError" }
  );
  assert.equal(findUniqueCalled, false);

  await assert.rejects(
    withPrismaMocks(
      {
        user: {
          findMany: async () => {
            throw new Error("database down");
          },
        },
      },
      () => listUsers()
    ),
    /database down/
  );
});
