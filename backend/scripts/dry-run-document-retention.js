import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertReadOnlyPrismaClient,
  assertRequiredEnvironment,
  candidateQuery,
  currentFilePath,
  documentRetentionCutoff,
  findDocumentRetentionCandidates,
  formatCandidateDetails,
  formatDryRunOutput,
  formatDryRunSummary,
  isDocumentRetentionCandidate,
  loadBackendEnv,
  parseDryRunArgs,
  sanitizeErrorMessage,
  subtractCalendarMonthsUtc,
} from "./document-retention.js";

export {
  assertReadOnlyPrismaClient,
  assertRequiredEnvironment,
  candidateQuery,
  documentRetentionCutoff,
  findDocumentRetentionCandidates,
  formatCandidateDetails as formatDetails,
  formatDryRunOutput as formatOutput,
  formatDryRunSummary as formatSummary,
  isDocumentRetentionCandidate,
  parseDryRunArgs as parseArgs,
  sanitizeErrorMessage,
  subtractCalendarMonthsUtc,
};

const thisFilePath = currentFilePath(import.meta.url);

export async function runDocumentRetentionDryRun({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
  prisma = new PrismaClient(),
  stdout = process.stdout,
  stderr = process.stderr,
  loadEnv = () => loadBackendEnv(import.meta.url),
} = {}) {
  try {
    loadEnv();
    const options = parseDryRunArgs(argv);
    assertRequiredEnvironment(env, "document retention dry-run");
    assertReadOnlyPrismaClient(prisma);

    const cutoff = documentRetentionCutoff(now);
    await prisma.$connect();
    const candidates = await findDocumentRetentionCandidates(prisma, cutoff);

    stdout.write(`${formatDryRunOutput({ cutoff, candidates, now, details: options.details })}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Document retention dry-run failed: ${sanitizeErrorMessage(error, env)}\n`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && thisFilePath === path.resolve(process.argv[1])) {
  const exitCode = await runDocumentRetentionDryRun();
  process.exit(exitCode);
}
