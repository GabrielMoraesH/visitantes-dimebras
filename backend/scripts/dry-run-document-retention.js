import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "@prisma/client";

const RETENTION_MONTHS = 6;
const WRITE_METHODS = new Set(["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"]);

function currentFilePath() {
  return fileURLToPath(import.meta.url);
}

function backendRoot() {
  return path.resolve(path.dirname(currentFilePath()), "..");
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

export function candidateQuery(cutoff) {
  return {
    where: {
      documentFrontBytes: { not: null },
      documentBackBytes: { not: null },
      documentFrontUpdatedAt: { lte: cutoff },
      documentBackUpdatedAt: { lte: cutoff },
    },
    select: {
      id: true,
      documentFrontUpdatedAt: true,
      documentBackUpdatedAt: true,
      createdInBranchId: true,
    },
    orderBy: { id: "asc" },
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

export function parseArgs(argv = []) {
  const flags = new Set(argv);
  const unknown = argv.filter((arg) => arg !== "--details");
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown.join(", ")}`);
  }

  return { details: flags.has("--details") };
}

export function assertRequiredEnvironment(env = process.env) {
  if (!env.NODE_ENV) {
    throw new Error("NODE_ENV must be defined before running document retention dry-run.");
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be defined before running document retention dry-run.");
  }
}

function approximateAgeDays(documentDate, now) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((now.getTime() - new Date(documentDate).getTime()) / millisecondsPerDay);
}

function branchSummary(candidates) {
  const counts = new Map();
  for (const candidate of candidates) {
    const branch = candidate.createdInBranchId ?? "none";
    counts.set(branch, (counts.get(branch) || 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)));
}

export function formatSummary({ cutoff, candidates, now, includeClosing = true }) {
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

export function formatDetails({ candidates }) {
  return candidates
    .map(
      (candidate) =>
        `Visitor ${candidate.id} | branch ${candidate.createdInBranchId ?? "none"} | front ${new Date(
          candidate.documentFrontUpdatedAt
        ).toISOString()} | back ${new Date(candidate.documentBackUpdatedAt).toISOString()}`
    )
    .join("\n");
}

export function formatOutput({ cutoff, candidates, now, details }) {
  const summary = formatSummary({ cutoff, candidates, now, includeClosing: false });
  const lines = [summary];
  if (details && candidates.length > 0) {
    lines.push(formatDetails({ candidates }));
  }
  lines.push("No data was changed.");
  lines.push("DRY-RUN: nenhum dado foi alterado.");
  return lines.join("\n");
}

function sanitizeErrorMessage(error, env = process.env) {
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

export async function runDocumentRetentionDryRun({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
  prisma = new PrismaClient(),
  stdout = process.stdout,
  stderr = process.stderr,
  loadEnv = () => loadDotenv({ path: path.join(backendRoot(), ".env") }),
} = {}) {
  try {
    loadEnv();
    const options = parseArgs(argv);
    assertRequiredEnvironment(env);
    assertReadOnlyPrismaClient(prisma);

    const cutoff = documentRetentionCutoff(now);
    await prisma.$connect();
    const candidates = await findDocumentRetentionCandidates(prisma, cutoff);

    stdout.write(`${formatOutput({ cutoff, candidates, now, details: options.details })}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Document retention dry-run failed: ${sanitizeErrorMessage(error, env)}\n`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && currentFilePath() === path.resolve(process.argv[1])) {
  const exitCode = await runDocumentRetentionDryRun();
  process.exit(exitCode);
}
