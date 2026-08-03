import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertExecuteConfirmation,
  assertRequiredEnvironment,
  clearExpiredDocumentFields,
  currentFilePath,
  documentRetentionCutoff,
  findDocumentRetentionCandidates,
  formatExecuteOutput,
  loadBackendEnv,
  parseExecuteArgs,
  sanitizeErrorMessage,
} from "./document-retention.js";

const thisFilePath = currentFilePath(import.meta.url);

export async function runDocumentRetentionExecution({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date(),
  prisma = new PrismaClient(),
  stdout = process.stdout,
  stderr = process.stderr,
  loadEnv = () => loadBackendEnv(import.meta.url),
} = {}) {
  let attemptedConnect = false;

  try {
    loadEnv();
    const options = parseExecuteArgs(argv);
    assertRequiredEnvironment(env, "document retention execution");
    assertExecuteConfirmation(options);

    const cutoff = documentRetentionCutoff(now);
    attemptedConnect = true;
    await prisma.$connect();

    const candidates = await findDocumentRetentionCandidates(prisma, cutoff);
    if (candidates.length === 0) {
      stdout.write(
        `${formatExecuteOutput({ cutoff, candidates, now, details: options.details, updatedCount: 0, skippedUpdate: true })}\n`
      );
      return 0;
    }

    const result = await clearExpiredDocumentFields(prisma, cutoff);
    const updatedCount = result.count ?? 0;
    stdout.write(`${formatExecuteOutput({ cutoff, candidates, now, details: options.details, updatedCount })}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Document retention execution failed: ${sanitizeErrorMessage(error, env)}\n`);
    return 1;
  } finally {
    if (attemptedConnect) {
      await prisma.$disconnect();
    }
  }
}

if (process.argv[1] && thisFilePath === path.resolve(process.argv[1])) {
  const exitCode = await runDocumentRetentionExecution();
  process.exit(exitCode);
}
