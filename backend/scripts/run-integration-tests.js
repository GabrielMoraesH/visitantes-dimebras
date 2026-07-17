import { spawn } from "node:child_process";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function readEnvValue(name) {
  const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
  const line = env.split(/\r?\n/).find((item) => item.trim().startsWith(`${name}=`));
  if (!line) return null;
  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

function assertSafeTestUrl(url) {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "");
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("Integration tests require a local database host.");
  }
  if (!database.includes("_test")) {
    throw new Error("Integration tests require a database name containing _test.");
  }
  if (/prod|production|prd/i.test(database + parsed.hostname)) {
    throw new Error("Integration tests refused a production-looking database.");
  }
  return {
    parsed,
    host: parsed.hostname,
    port: parsed.port || "5432",
    database,
  };
}

function deriveTestUrl() {
  const explicit = process.env.TEST_DATABASE_URL;
  if (!explicit) throw new Error("TEST_DATABASE_URL is required for integration tests.");
  return explicit;
}

function quoteShellArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function run(command, args, env) {
  const useShell = process.platform === "win32";
  const commandLine = [command, ...args].map(quoteShellArg).join(" ");

  return new Promise((resolve, reject) => {
    const child = spawn(useShell ? commandLine : command, useShell ? [] : args, {
      env: Object.fromEntries(
        Object.entries(env).filter(([, value]) => value !== undefined && value !== null)
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

function quoteIdent(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error("Unsafe test database identifier.");
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensureDatabase(testUrl) {
  const { parsed, database } = assertSafeTestUrl(testUrl);
  const maintenanceUrl = new URL(parsed.toString());
  maintenanceUrl.pathname = "/postgres";

  const prisma = new PrismaClient({
    datasources: { db: { url: maintenanceUrl.toString() } },
  });

  try {
    const existing = await prisma.$queryRaw`
      SELECT 1
      FROM pg_database
      WHERE datname = ${database}
      LIMIT 1
    `;
    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE ${quoteIdent(database)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

const testUrl = deriveTestUrl();
const info = assertSafeTestUrl(testUrl);
console.log(
  `Integration database: host=${info.host} port=${info.port} database=${info.database} production=false`
);

await ensureDatabase(testUrl);

const env = {
  ...process.env,
  DATABASE_URL: testUrl,
  JWT_SECRET: process.env.JWT_SECRET || readEnvValue("JWT_SECRET") || "integration-test-secret",
};

await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
await run(process.execPath, ["--test", "src/integration/openVisitConcurrency.integration.js"], env);
