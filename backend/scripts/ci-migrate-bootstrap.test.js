import test from "node:test";
import assert from "node:assert/strict";
import {
  FINAL_BRANCHES,
  LEGACY_BRANCHES,
  assertBranchesEmptyBeforeBootstrap,
  assertExactBranches,
  assertSafeCiEnvironment,
  migrationsBeforeRemap,
} from "./ci-migrate-bootstrap.js";

const safeEnv = {
  CI: "true",
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://ci_user:ci_password@localhost:5432/dimebras_visitantes_test?schema=public",
};

test("assertSafeCiEnvironment accepts the disposable CI test database", () => {
  assert.deepEqual(assertSafeCiEnvironment(safeEnv), {
    host: "localhost",
    port: "5432",
    database: "dimebras_visitantes_test",
  });
});

test("assertSafeCiEnvironment rejects when CI is not true", () => {
  assert.throws(
    () => assertSafeCiEnvironment({ ...safeEnv, CI: undefined }),
    /CI is not true/
  );
});

test("assertSafeCiEnvironment rejects when NODE_ENV is not test", () => {
  assert.throws(
    () => assertSafeCiEnvironment({ ...safeEnv, NODE_ENV: "production" }),
    /NODE_ENV is not test/
  );
});

test("assertSafeCiEnvironment rejects databases that do not end in _test", () => {
  assert.throws(
    () =>
      assertSafeCiEnvironment({
        ...safeEnv,
        DATABASE_URL: "postgresql://ci_user:ci_password@localhost:5432/dimebras_visitantes?schema=public",
      }),
    /ending in _test/
  );
});

test("assertSafeCiEnvironment rejects non-local hosts", () => {
  assert.throws(
    () =>
      assertSafeCiEnvironment({
        ...safeEnv,
        DATABASE_URL: "postgresql://ci_user:ci_password@db.example.com:5432/dimebras_visitantes_test?schema=public",
      }),
    /local or CI service/
  );
});

test("assertSafeCiEnvironment rejects production-looking targets", () => {
  assert.throws(
    () =>
      assertSafeCiEnvironment({
        ...safeEnv,
        DATABASE_URL: "postgresql://prod_user:ci_password@localhost:5432/dimebras_prod_test?schema=public",
      }),
    /production-looking/
  );
});

test("migrationsBeforeRemap keeps only migrations before the historical remap", () => {
  assert.deepEqual(
    migrationsBeforeRemap([
      "20260211174719_init",
      "20260721164000_remap_branch_official_ids",
      "20260722120000_future_migration",
    ]),
    ["20260211174719_init"]
  );
});

test("assertExactBranches accepts the required legacy branch state", () => {
  assert.doesNotThrow(() => assertExactBranches(LEGACY_BRANCHES, LEGACY_BRANCHES, "Legacy"));
});

test("assertExactBranches accepts the required final branch state", () => {
  assert.doesNotThrow(() => assertExactBranches(FINAL_BRANCHES, FINAL_BRANCHES, "Final"));
});

test("assertExactBranches rejects unexpected branch rows", () => {
  assert.throws(
    () => assertExactBranches([{ id: 1, name: "Dimebras PR" }], LEGACY_BRANCHES, "Legacy"),
    /branch state mismatch/
  );
});

test("assertBranchesEmptyBeforeBootstrap rejects existing branch data", async () => {
  const db = {
    $queryRaw: async () => [{ id: 99, name: "Unexpected Branch" }],
  };

  await assert.rejects(() => assertBranchesEmptyBeforeBootstrap(db), /expected an empty branches table/);
});
