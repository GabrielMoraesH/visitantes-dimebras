import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

export const REMAP_MIGRATION = "20260721164000_remap_branch_official_ids";

export const LEGACY_BRANCHES = [
  { id: 1, name: "Dimebras PR" },
  { id: 2, name: "Dimebras MT" },
  { id: 4, name: "Dimebras MS" },
  { id: 5, name: "Dimebras SC" },
  { id: 6, name: "Alfamed MS" },
];

export const FINAL_BRANCHES = [
  { id: 1, name: "Dimebras PR" },
  { id: 2, name: "Alfamed MS" },
  { id: 3, name: "Dimebras MT" },
  { id: 5, name: "Dimebras MS" },
  { id: 6, name: "Dimebras SC" },
];

const ALLOWED_CI_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
const PROD_LOOKING_PATTERN = /(^|[-_])(prod|production|prd)([-_]|$)/i;

function currentFilePath() {
  return fileURLToPath(import.meta.url);
}

function backendRoot() {
  return path.resolve(path.dirname(currentFilePath()), "..");
}

function quoteShellArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function safeDatabaseInfo(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for CI migration bootstrap.");
  }

  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const host = parsed.hostname;
  const port = parsed.port || "5432";

  return { parsed, database, host, port };
}

export function assertSafeCiEnvironment(env = process.env) {
  if (env.CI !== "true") {
    throw new Error("CI migration bootstrap refused to run because CI is not true.");
  }

  if (env.NODE_ENV !== "test") {
    throw new Error("CI migration bootstrap refused to run because NODE_ENV is not test.");
  }

  const info = safeDatabaseInfo(env.DATABASE_URL);

  if (!info.database.endsWith("_test")) {
    throw new Error("CI migration bootstrap requires a database name ending in _test.");
  }

  if (!ALLOWED_CI_HOSTS.has(info.host)) {
    throw new Error("CI migration bootstrap requires a local or CI service database host.");
  }

  const productionCheck = `${info.host} ${info.database} ${info.parsed.username}`;
  if (PROD_LOOKING_PATTERN.test(productionCheck)) {
    throw new Error("CI migration bootstrap refused a production-looking database target.");
  }

  return {
    host: info.host,
    port: info.port,
    database: info.database,
  };
}

function run(command, args, options = {}) {
  const useShell = process.platform === "win32";
  const commandLine = [command, ...args].map(quoteShellArg).join(" ");

  return new Promise((resolve, reject) => {
    const child = spawn(useShell ? commandLine : command, useShell ? [] : args, {
      cwd: options.cwd,
      env: Object.fromEntries(
        Object.entries(options.env || process.env).filter(([, value]) => value !== undefined && value !== null)
      ),
      stdio: "inherit",
      shell: useShell,
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

function listMigrationDirectories(migrationsDir) {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function migrationsBeforeRemap(migrationNames) {
  if (!migrationNames.includes(REMAP_MIGRATION)) {
    throw new Error(`Required migration ${REMAP_MIGRATION} was not found.`);
  }

  const priorMigrations = migrationNames.filter((name) => name < REMAP_MIGRATION);
  if (priorMigrations.length === 0) {
    throw new Error("No migrations found before branch ID remap.");
  }

  return priorMigrations;
}

function preparePreRemapPrismaDir(rootDir) {
  const sourcePrismaDir = path.join(rootDir, "prisma");
  const sourceMigrationsDir = path.join(sourcePrismaDir, "migrations");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dimebras-ci-prisma-"));
  const tempPrismaDir = path.join(tempRoot, "prisma");
  const tempMigrationsDir = path.join(tempPrismaDir, "migrations");

  fs.mkdirSync(tempMigrationsDir, { recursive: true });
  fs.copyFileSync(path.join(sourcePrismaDir, "schema.prisma"), path.join(tempPrismaDir, "schema.prisma"));
  fs.copyFileSync(
    path.join(sourceMigrationsDir, "migration_lock.toml"),
    path.join(tempMigrationsDir, "migration_lock.toml")
  );

  for (const migrationName of migrationsBeforeRemap(listMigrationDirectories(sourceMigrationsDir))) {
    fs.cpSync(path.join(sourceMigrationsDir, migrationName), path.join(tempMigrationsDir, migrationName), {
      recursive: true,
    });
  }

  return {
    tempRoot,
    schemaPath: path.join(tempPrismaDir, "schema.prisma"),
  };
}

function branchesMatch(rows, expected) {
  return (
    rows.length === expected.length &&
    rows.every((row, index) => row.id === expected[index].id && row.name === expected[index].name)
  );
}

function describeBranches(rows) {
  return rows.map((branch) => `${branch.id}:${branch.name}`).join(", ") || "(none)";
}

export async function readBranches(db) {
  return db.$queryRaw`
    SELECT "id", "name"
    FROM "branches"
    ORDER BY "id" ASC
  `;
}

export function assertExactBranches(rows, expected, label) {
  if (!branchesMatch(rows, expected)) {
    throw new Error(
      `${label} branch state mismatch. Expected ${describeBranches(expected)}; found ${describeBranches(rows)}.`
    );
  }
}

export async function assertBranchesEmptyBeforeBootstrap(db) {
  const rows = await readBranches(db);
  if (rows.length !== 0) {
    throw new Error(`CI migration bootstrap expected an empty branches table; found ${describeBranches(rows)}.`);
  }
}

export async function insertLegacyBranches(db) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "branches" ("id", "name")
      VALUES
        (1, 'Dimebras PR'),
        (2, 'Dimebras MT'),
        (4, 'Dimebras MS'),
        (5, 'Dimebras SC'),
        (6, 'Alfamed MS')
    `;

    const rows = await readBranches(tx);
    assertExactBranches(rows, LEGACY_BRANCHES, "Legacy");

    const id3Rows = rows.filter((branch) => branch.id === 3);
    if (id3Rows.length !== 0) {
      throw new Error("Legacy branch bootstrap requires branch ID 3 to be free.");
    }
  });
}

export async function assertFinalBranchState(db) {
  const rows = await readBranches(db);
  assertExactBranches(rows, FINAL_BRANCHES, "Final");

  const id4Rows = rows.filter((branch) => branch.id === 4);
  if (id4Rows.length !== 0) {
    throw new Error("Final branch state requires branch ID 4 to be absent.");
  }

  const sequenceRows = await db.$queryRaw`
    SELECT last_value, is_called
    FROM "branches_id_seq"
  `;
  const sequence = sequenceRows[0];
  if (!sequence || Number(sequence.last_value) !== 6 || sequence.is_called !== true) {
    throw new Error("branches_id_seq is not synchronized to generate 7 as the next branch ID.");
  }
}

async function runPrismaMigrateDeploy(rootDir, schemaPath, env) {
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", schemaPath], {
    cwd: rootDir,
    env,
  });
}

export async function main() {
  const safeInfo = assertSafeCiEnvironment();
  console.log(
    `CI migration bootstrap database: host=${safeInfo.host} port=${safeInfo.port} database=${safeInfo.database} production=false`
  );

  const rootDir = backendRoot();
  const temp = preparePreRemapPrismaDir(rootDir);
  const env = { ...process.env };
  const prisma = new PrismaClient();

  try {
    await runPrismaMigrateDeploy(rootDir, temp.schemaPath, env);
    await assertBranchesEmptyBeforeBootstrap(prisma);
    await insertLegacyBranches(prisma);
    console.log("Legacy branches inserted for historical remap migration.");

    await runPrismaMigrateDeploy(rootDir, path.join(rootDir, "prisma", "schema.prisma"), env);
    await assertFinalBranchState(prisma);
    console.log("Final branch mapping validated after full migration deploy.");
  } finally {
    await prisma.$disconnect();
    fs.rmSync(temp.tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && currentFilePath() === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error("CI migration bootstrap failed:", error.message);
    process.exit(1);
  });
}
