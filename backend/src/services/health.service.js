import fs from "node:fs";
import prisma from "../lib/prisma.js";
import { tvTempUploadDir, tvUploadDir, uploadRoot } from "../config/uploads.js";

const DATABASE_TIMEOUT_MS = 1500;

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("health-timeout")), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function checkDatabase() {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DATABASE_TIMEOUT_MS);
    return "up";
  } catch {
    return "down";
  }
}

export async function checkTvStorage() {
  try {
    await Promise.all([
      fs.promises.access(uploadRoot, fs.constants.R_OK | fs.constants.W_OK),
      fs.promises.access(tvUploadDir, fs.constants.R_OK | fs.constants.W_OK),
      fs.promises.access(tvTempUploadDir, fs.constants.R_OK | fs.constants.W_OK),
    ]);
    return "up";
  } catch {
    return "down";
  }
}

export async function readiness() {
  const [database, storage] = await Promise.all([checkDatabase(), checkTvStorage()]);

  return {
    ok: database === "up" && storage === "up",
    database,
    storage,
    databaseTimeoutMs: DATABASE_TIMEOUT_MS,
  };
}
