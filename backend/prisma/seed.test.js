import test from "node:test";
import assert from "node:assert/strict";
import { ensureOfficialBranches, OFFICIAL_BRANCHES } from "./seed.js";

function createSeedDb(initialBranches) {
  const branches = initialBranches.map((branch) => ({ ...branch }));
  const created = [];
  const rawCalls = [];

  const tx = {
    branch: {
      findMany: async ({ where, orderBy }) => {
        let result = branches;
        if (where?.id?.in) {
          result = result.filter((branch) => where.id.in.includes(branch.id));
        }
        if (where?.name?.in) {
          result = result.filter((branch) => where.name.in.includes(branch.name));
        }
        if (orderBy?.id === "asc") {
          result = [...result].sort((a, b) => a.id - b.id);
        }
        return result.map((branch) => ({ id: branch.id, name: branch.name }));
      },
      create: async ({ data }) => {
        branches.push({ ...data });
        created.push({ ...data });
        return { ...data };
      },
    },
    $executeRaw: async (...args) => {
      rawCalls.push(args);
      return 1;
    },
  };

  return {
    branches,
    created,
    rawCalls,
    db: {
      $transaction: async (callback) => callback(tx),
    },
  };
}

test("ensureOfficialBranches creates official IDs in an empty database and leaves ID 4 unused", async () => {
  const state = createSeedDb([]);

  await ensureOfficialBranches(state.db);

  assert.deepEqual(
    state.created,
    OFFICIAL_BRANCHES.map((branch) => ({ ...branch }))
  );
  assert.equal(state.branches.some((branch) => branch.id === 4), false);
  assert.equal(state.rawCalls.length, 1);
});

test("ensureOfficialBranches is idempotent when official branches already exist", async () => {
  const state = createSeedDb(OFFICIAL_BRANCHES);

  await ensureOfficialBranches(state.db);

  assert.deepEqual(state.created, []);
  assert.deepEqual(
    state.branches.sort((a, b) => a.id - b.id),
    OFFICIAL_BRANCHES
  );
  assert.equal(state.rawCalls.length, 1);
});

test("ensureOfficialBranches fails when an official ID is occupied by another branch", async () => {
  const state = createSeedDb([
    { id: 1, name: "Dimebras PR" },
    { id: 2, name: "Dimebras MT" },
  ]);

  await assert.rejects(
    () => ensureOfficialBranches(state.db),
    /ID 2 deveria ser Alfamed MS/
  );
  assert.deepEqual(state.created, []);
  assert.equal(state.rawCalls.length, 0);
});

test("ensureOfficialBranches fails when an official name exists with the wrong ID", async () => {
  const state = createSeedDb([
    { id: 1, name: "Dimebras PR" },
    { id: 6, name: "Alfamed MS" },
  ]);

  await assert.rejects(
    () => ensureOfficialBranches(state.db),
    /Alfamed MS deveria usar ID 2/
  );
  assert.deepEqual(state.created, []);
  assert.equal(state.rawCalls.length, 0);
});
