import { createRequire } from "node:module";
import prisma from "../lib/prisma.js";
import { logError } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

const DATABASE_TIMEOUT_MS = 1500;

function createBasePayload() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    version,
  };
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("health-timeout")), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function checkDatabase() {
  await withTimeout(prisma.$queryRaw`SELECT 1`, DATABASE_TIMEOUT_MS);
}

export function getLiveness() {
  return {
    httpStatus: 200,
    body: createBasePayload(),
  };
}

export async function getReadiness() {
  const payload = {
    ...createBasePayload(),
    database: {
      status: "ok",
    },
  };

  try {
    await checkDatabase();
    return { httpStatus: 200, body: payload };
  } catch (err) {
    logError("health_database_check_failed", {
      errorName: err?.name,
      errorCode: err?.code,
    });

    return {
      httpStatus: 503,
      body: {
        ...payload,
        status: "degraded",
        database: {
          status: "error",
        },
      },
    };
  }
}
