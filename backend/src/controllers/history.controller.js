import prisma from "../lib/prisma.js";

function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

export async function listHistory(req, res) {
  try {
    const { cpf, status, branchName, date } = req.query;

    const page = Math.max(1, Number(req.query.page || 1));
    const limitRaw = Number(req.query.limit || 25);
    const limit = Math.min(100, Math.max(1, limitRaw));
    const skip = (page - 1) * limit;

    const where = {};

    if (status === "open") where.checkoutAt = null;
    if (status === "closed") where.checkoutAt = { not: null };

    if (cpf) {
      where.visitor = { cpf: onlyDigits(cpf) };
    }

    if (branchName && branchName !== "all") {
      where.branch = { name: branchName };
    }
    
    if (date) {
      const start = new Date(`${date}T00:00:00.000`);
      const end = new Date(`${date}T23:59:59.999`);
      where.checkinAt = { gte: start, lte: end };
    }

    const total = await prisma.visit.count({ where });

    const items = await prisma.visit.findMany({
      where,
      orderBy: { checkinAt: "desc" },
      skip,
      take: limit,
      include: {
        visitor: true,
        branch: true,
        checkinByUser: { select: { username: true } },
        checkoutByUser: { select: { username: true } },
      },
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      items,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar histórico" });
  }
}