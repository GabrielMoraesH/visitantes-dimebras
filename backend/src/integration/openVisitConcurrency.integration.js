import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../lib/prisma.js";
import { checkin, checkout } from "../services/visit.service.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertSafeDatabase() {
  const url = new URL(process.env.DATABASE_URL || "");
  const database = url.pathname.replace(/^\//, "");
  assert.equal(LOCAL_HOSTS.has(url.hostname), true, "database host must be local");
  assert.equal(database.includes("_test"), true, "database name must contain _test");
  assert.equal(/prod|production|prd/i.test(database + url.hostname), false);
  return {
    host: url.hostname,
    port: url.port || "5432",
    database,
  };
}

function validInput(visitorId) {
  return {
    visitorId,
    areaToVisit: "Recepcao",
    attendedBy: "Teste Integracao",
    serviceType: "Concorrencia",
  };
}

async function createArtificialData(marker) {
  const branch = await prisma.branch.create({ data: { name: `${marker}_BRANCH` } });
  const user = await prisma.user.create({
    data: {
      username: `${marker}_USER`,
      passwordHash: "artificial-integration-only",
      role: "RECEPCAO",
      branchId: branch.id,
    },
  });
  const visitor = await prisma.visitor.create({
    data: {
      name: `${marker}_VISITOR`,
      cpf: randomUUID().replace(/\D/g, "").padEnd(11, "0").slice(0, 11),
      company: "ARTIFICIAL_INTEGRATION_TEST",
      photoBytes: Buffer.from("p"),
      photoMime: "image/jpeg",
      photoUpdatedAt: new Date(),
      documentFrontBytes: Buffer.from("f"),
      documentFrontMime: "image/jpeg",
      documentFrontUpdatedAt: new Date(),
      documentBackBytes: Buffer.from("b"),
      documentBackMime: "image/jpeg",
      documentBackUpdatedAt: new Date(),
      createdById: user.id,
      createdInBranchId: branch.id,
    },
  });

  return { branch, user, visitor };
}

async function cleanupArtificialData({ marker }) {
  await prisma.visit.deleteMany({ where: { visitor: { name: { startsWith: marker } } } });
  await prisma.visitor.deleteMany({ where: { name: { startsWith: marker } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: marker } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: marker } } });
}

test("database prevents two simultaneous open visits for the same visitor and branch", async () => {
  const db = assertSafeDatabase();
  const marker = `CODEX_OPEN_VISIT_${randomUUID().replace(/-/g, "_")}`;
  let originalFindFirst;

  try {
    const { branch, user, visitor } = await createArtificialData(marker);
    originalFindFirst = prisma.visit.findFirst;

    let arrived = 0;
    let releaseBarrier;
    const barrier = new Promise((resolve) => {
      releaseBarrier = resolve;
    });

    prisma.visit.findFirst = async (args) => {
      const isTargetOpenLookup =
        Number(args?.where?.visitorId) === visitor.id &&
        Number(args?.where?.branchId) === branch.id &&
        args?.where?.checkoutAt === null;

      const result = await originalFindFirst.call(prisma.visit, args);
      if (!isTargetOpenLookup || result) return result;

      arrived += 1;
      if (arrived === 2) releaseBarrier();
      await barrier;
      return result;
    };

    const settled = await Promise.allSettled([
      checkin({ user, input: validInput(visitor.id) }),
      checkin({ user, input: validInput(visitor.id) }),
    ]);
    const rejected = settled.filter((result) => result.status === "rejected");
    assert.deepEqual(rejected, []);

    const attempts = settled.map((result) => result.value);

    const successes = attempts.filter((result) => result.ok);
    const conflicts = attempts.filter(
      (result) =>
        !result.ok &&
        result.status === 400 &&
        result.message === "Visitante já possui visita em andamento."
    );

    assert.equal(successes.length, 1);
    assert.equal(conflicts.length, 1);

    const openCount = await prisma.visit.count({
      where: { visitorId: visitor.id, branchId: branch.id, checkoutAt: null },
    });
    assert.equal(openCount, 1);

    const checkoutResult = await checkout({
      user,
      input: { visitCode: successes[0].visit.visitCode },
    });
    assert.equal(checkoutResult.ok, true);

    const nextCheckin = await checkin({ user, input: validInput(visitor.id) });
    assert.equal(nextCheckin.ok, true);

    const finalOpenCount = await prisma.visit.count({
      where: { visitorId: visitor.id, branchId: branch.id, checkoutAt: null },
    });
    assert.equal(finalOpenCount, 1);

    console.log(
      `checked host=${db.host} port=${db.port} database=${db.database} success=1 conflict=1 finalOpenCount=1`
    );
  } finally {
    if (originalFindFirst) prisma.visit.findFirst = originalFindFirst;
    await cleanupArtificialData({ marker });
    await prisma.$disconnect();
  }
});
