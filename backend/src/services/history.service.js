import { z } from "zod";
import prisma from "../lib/prisma.js";
import {
  boundedLimitQuery,
  boundedPageQuery,
  cpfSchema,
  dateOnlySchema,
} from "../utils/validation.js";

const historyQuerySchema = z.object({
  cpf: cpfSchema.optional(),
  status: z.enum(["open", "closed"]).optional(),
  branchName: z.string().trim().max(120).optional(),
  date: dateOnlySchema.optional(),
  page: boundedPageQuery.optional().default("1"),
  limit: boundedLimitQuery(100, 25),
}).strict();

function buildHistoryWhere({ cpf, status, branchName, date }) {
  const where = {};

  if (status === "open") where.checkoutAt = null;
  if (status === "closed") where.checkoutAt = { not: null };

  if (cpf) {
    where.visitor = { cpf };
  }

  if (branchName && branchName !== "all") {
    where.branch = { name: branchName };
  }

  if (date) {
    const start = new Date(`${date}T00:00:00.000`);
    const end = new Date(`${date}T23:59:59.999`);
    where.checkinAt = { gte: start, lte: end };
  }

  return where;
}

export async function listHistory({ actor, query }) {
  void actor;

  const { cpf, status, branchName, date, page, limit } = historyQuerySchema.parse(query);
  const skip = (page - 1) * limit;
  const where = buildHistoryWhere({ cpf, status, branchName, date });

  const shouldMeasureQuery = process.env.NODE_ENV !== "production";
  const queryStartedAt = shouldMeasureQuery ? performance.now() : 0;

  const [total, items] = await Promise.all([
    prisma.visit.count({ where }),
    prisma.visit.findMany({
      where,
      orderBy: { checkinAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        checkinAt: true,
        checkoutAt: true,
        attendedBy: true,
        branchName: true,
        visitor: {
          select: {
            name: true,
            cpf: true,
            company: true,
          },
        },
        branch: {
          select: {
            name: true,
          },
        },
        checkinByUser: {
          select: {
            username: true,
          },
        },
        checkoutByUser: {
          select: {
            username: true,
          },
        },
      },
    }),
  ]);

  if (shouldMeasureQuery) {
    const queryDurationMs = performance.now() - queryStartedAt;
    console.log(`history-query: ${queryDurationMs.toFixed(2)}ms`);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items,
    page,
    limit,
    total,
    totalPages,
  };
}
