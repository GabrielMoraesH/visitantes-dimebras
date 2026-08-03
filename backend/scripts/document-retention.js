import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

export const RETENTION_MONTHS = 6;
export const EXECUTE_CONFIRMATION = "DELETE_EXPIRED_DOCUMENTS";

const WRITE_METHODS = new Set(["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"]);
const KNOWN_ENVIRONMENTS = new Set(["development", "test", "production", "staging"]);

export function currentFilePath(importMetaUrl) {
  return fileURLToPath(importMetaUrl);
}

export function backendRoot(importMetaUrl) {
  return path.resolve(path.dirname(currentFilePath(importMetaUrl)), "..");
}

export function loadBackendEnv(importMetaUrl) {
  return loadDotenv({ path: path.join(backendRoot(importMetaUrl), ".env") });
}

function utcLastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function subtractCalendarMonthsUtc(date, months) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("A valid current date is required to calculate the retention cutoff.");
  }

  // Calendar subtraction clamps overflowing days to the target month end:
  // 2026-08-31 minus 6 months becomes 2026-02-28; in leap years, 2024-02-29.
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() - months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const targetDay = Math.min(date.getUTCDate(), utcLastDayOfMonth(targetYear, targetMonth));

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

export function documentRetentionCutoff(now = new Date()) {
  return subtractCalendarMonthsUtc(now, RETENTION_MONTHS);
}

export function documentRetentionWhere(cutoff) {
  return {
    documentFrontBytes: { not: null },
    documentBackBytes: { not: null },
    documentFrontUpdatedAt: { not: null, lte: cutoff },
    documentBackUpdatedAt: { not: null, lte: cutoff },
  };
}

export function candidateQuery(cutoff) {
  return {
    where: documentRetentionWhere(cutoff),
    select: {
      id: true,
      documentFrontUpdatedAt: true,
      documentBackUpdatedAt: true,
      createdInBranchId: true,
    },
    orderBy: { id: "asc" },
  };
}

export function documentRetentionClearData() {
  return {
    documentFrontBytes: null,
    documentFrontMime: null,
    documentFrontUpdatedAt: null,
    documentBackBytes: null,
    documentBackMime: null,
    documentBackUpdatedAt: null,
  };
}

export function updateExpiredDocumentsArgs(cutoff) {
  return {
    where: documentRetentionWhere(cutoff),
    data: documentRetentionClearData(),
  };
}

export function isDocumentRetentionCandidate(visitor, cutoff) {
  if (!visitor?.documentFrontBytes || !visitor?.documentBackBytes) return false;
  if (!visitor.documentFrontUpdatedAt || !visitor.documentBackUpdatedAt) return false;

  const newestDocumentDate = new Date(
    Math.max(
      new Date(visitor.documentFrontUpdatedAt).getTime(),
      new Date(visitor.documentBackUpdatedAt).getTime()
    )
  );

  return newestDocumentDate.getTime() <= cutoff.getTime();
}

export function parseDryRunArgs(argv = []) {
  const flags = new Set(argv);
  const unknown = argv.filter((arg) => arg !== "--details");
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  }

  return { details: flags.has("--details") };
}

export function parseExecuteArgs(argv = []) {
  const options = { details: false, confirmation: null };
  const unknown = [];

  for (const arg of argv) {
    if (arg === "--details") {
      options.details = true;
    } else if (arg.startsWith("--confirm=")) {
      options.confirmation = arg.slice("--confirm=".length);
    } else if (arg === "--confirm") {
      options.confirmation = true;
    } else {
      unknown.push(arg);
    }
  }

  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  }

  return options;
}

export function assertRequiredEnvironment(env = process.env, mode = "document retention") {
  if (!env.NODE_ENV) {
    throw new Error(`NODE_ENV must be defined before running ${mode}.`);
  }

  if (!KNOWN_ENVIRONMENTS.has(env.NODE_ENV)) {
    throw new Error(`NODE_ENV must be one of: ${[...KNOWN_ENVIRONMENTS].join(", ")}.`);
  }

  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL must be defined before running ${mode}.`);
  }
}

export function assertExecuteConfirmation(options) {
  if (options.confirmation !== EXECUTE_CONFIRMATION) {
    throw new Error(
      `Refusing to execute document retention. Run with --confirm=${EXECUTE_CONFIRMATION} to clear expired document fields.`
    );
  }
}

function approximateAgeDays(documentDate, now) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((now.getTime() - new Date(documentDate).getTime()) / millisecondsPerDay);
}

export function branchSummary(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    const branch = candidate.createdInBranchId ?? "none";
    counts.set(branch, (counts.get(branch) || 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)));
}

export function formatCandidateDetails({ candidates }) {
  return candidates
    .map(
      (candidate) =>
        `Visitor ${candidate.id} | branch ${candidate.createdInBranchId ?? "none"} | front ${new Date(
          candidate.documentFrontUpdatedAt
        ).toISOString()} | back ${new Date(candidate.documentBackUpdatedAt).toISOString()}`
    )
    .join("\n");
}

export function formatDryRunSummary({ cutoff, candidates, now, includeClosing = true }) {
  const lines = [
    "Document retention dry-run",
    "Mode: DRY-RUN",
    "DRY-RUN: nenhum dado sera alterado.",
    `Cutoff: ${cutoff.toISOString()}`,
    `Candidates: ${candidates.length}`,
  ];

  for (const [branch, count] of branchSummary(candidates)) {
    lines.push(`Branch ${branch}: ${count}`);
  }

  if (candidates.length > 0) {
    const oldestDocumentAgeDays = Math.max(
      ...candidates.flatMap((candidate) => [
        approximateAgeDays(candidate.documentFrontUpdatedAt, now),
        approximateAgeDays(candidate.documentBackUpdatedAt, now),
      ])
    );
    lines.push(`Oldest document age: ${oldestDocumentAgeDays} days`);
  }

  if (includeClosing) {
    lines.push("No data was changed.");
    lines.push("DRY-RUN: nenhum dado foi alterado.");
  }

  return lines.join("\n");
}

export function formatDryRunOutput({ cutoff, candidates, now, details }) {
  const lines = [formatDryRunSummary({ cutoff, candidates, now, includeClosing: false })];
  if (details && candidates.length > 0) {
    lines.push(formatCandidateDetails({ candidates }));
  }
  lines.push("No data was changed.");
  lines.push("DRY-RUN: nenhum dado foi alterado.");
  return lines.join("\n");
}

export function formatExecuteOutput({ cutoff, candidates, now, details, updatedCount, skippedUpdate = false }) {
  const lines = [
    "Document retention execution",
    "Mode: EXECUTE",
    `Cutoff: ${cutoff.toISOString()}`,
    `Candidates: ${candidates.length}`,
  ];

  for (const [branch, count] of branchSummary(candidates)) {
    lines.push(`Branch ${branch}: ${count}`);
  }

  if (candidates.length > 0) {
    const oldestDocumentAgeDays = Math.max(
      ...candidates.flatMap((candidate) => [
        approximateAgeDays(candidate.documentFrontUpdatedAt, now),
        approximateAgeDays(candidate.documentBackUpdatedAt, now),
      ])
    );
    lines.push(`Oldest document age: ${oldestDocumentAgeDays} days`);
  }

  if (details && candidates.length > 0) {
    lines.push(formatCandidateDetails({ candidates }));
  }

  lines.push("Only document front/back fields will be cleared.");
  lines.push("Visitor photos will be preserved.");
  lines.push(`Updated: ${updatedCount}`);

  if (skippedUpdate) {
    lines.push("No candidates found. No update was executed.");
  }

  if (candidates.length !== updatedCount && !skippedUpdate) {
    lines.push("Candidate/update count differs; records may have changed between read and write.");
  }

  lines.push("Only document front/back fields were cleared.");
  lines.push("Visitor photos were preserved.");
  lines.push("Visitor updatedAt may change according to Prisma @updatedAt behavior.");

  return lines.join("\n");
}

export function sanitizeErrorMessage(error, env = process.env) {
  let message = error?.message || String(error);
  const secrets = [env.DATABASE_URL, env.JWT_SECRET, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_ANON_KEY].filter(Boolean);

  for (const secret of secrets) {
    message = message.split(secret).join("[redacted]");
  }

  message = message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-database-url]");
  return message;
}

export function assertReadOnlyPrismaClient(prisma) {
  for (const method of WRITE_METHODS) {
    if (typeof prisma.visitor?.[method] === "function") {
      continue;
    }
  }
}

export async function findDocumentRetentionCandidates(prisma, cutoff) {
  return prisma.visitor.findMany(candidateQuery(cutoff));
}

export async function clearExpiredDocumentFields(prisma, cutoff) {
  return prisma.visitor.updateMany(updateExpiredDocumentsArgs(cutoff));
}
