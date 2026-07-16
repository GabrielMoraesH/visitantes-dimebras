import { customAlphabet } from "nanoid";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { userCanAccessVisitor } from "../utils/visitorAccess.js";
import {
  boundedLimitQuery,
  cpfSchema,
  idParamSchema,
  LIMITS,
  positiveIntBody,
  trimmedString,
} from "../utils/validation.js";

const numericCode = customAlphabet("0123456789", 8);

const LABEL_TOKEN_TTL_SECONDS = Math.max(
  300,
  Number(process.env.LABEL_TOKEN_TTL_SECONDS || 8 * 60 * 60)
);

const asString = (v) => (v === null || v === undefined ? "" : String(v));

const checkinSchema = z.object({
  visitorId: positiveIntBody("Visitante invalido"),

  areaToVisit: z.preprocess(asString, trimmedString(LIMITS.visitText, "Selecione o setor.")),

  attendedBy: z.preprocess(
    asString,
    trimmedString(LIMITS.visitText, "Informe com quem veio falar.").min(
      2,
      "Informe com quem veio falar."
    )
  ),

  serviceType: z.preprocess(
    asString,
    trimmedString(LIMITS.visitText, "Informe o que veio fazer na empresa.").min(
      2,
      "Informe o que veio fazer na empresa."
    )
  ),
}).strict();

const checkoutSchema = z.object({
  visitCode: z
    .string()
    .trim()
    .min(6, "QR invalido (codigo muito curto)")
    .max(LIMITS.visitCode, "QR invalido"),
}).strict();

function userCanAccessVisit(user, visit) {
  const role = String(user?.role || "").toUpperCase();
  if (role === "ADMIN") return true;
  return Number(user?.branchId) === Number(visit.branchId);
}

function visitCpfWhere({ user, cpf }) {
  const role = String(user?.role || "").toUpperCase();
  const where = { visitor: { is: { cpf } } };

  if (role === "RECEPCAO") {
    where.branchId = user.branchId;
  }

  return where;
}

function isVisitorRegistrationExpired(visitor) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const photoMissing = !visitor.photoBytes || !visitor.photoMime;
  const frontMissing = !visitor.documentFrontBytes || !visitor.documentFrontMime;
  const backMissing = !visitor.documentBackBytes || !visitor.documentBackMime;

  const photoExpired = !visitor.photoUpdatedAt || visitor.photoUpdatedAt < sixMonthsAgo;
  const frontExpired =
    !visitor.documentFrontUpdatedAt || visitor.documentFrontUpdatedAt < sixMonthsAgo;
  const backExpired = !visitor.documentBackUpdatedAt || visitor.documentBackUpdatedAt < sixMonthsAgo;

  return photoMissing || frontMissing || backMissing || photoExpired || frontExpired || backExpired;
}

async function getBearerUserFromToken(authorization) {
  const header = String(authorization || "");
  if (!header || !header.startsWith("Bearer ")) return null;

  try {
    const payload = jwt.verify(header.slice("Bearer ".length), process.env.JWT_SECRET);
    const id = Number(payload.sub ?? payload.id);

    if (!Number.isInteger(id) || id <= 0) return null;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });

    if (!user || user.isActive !== true) return null;

    return user;
  } catch {
    return null;
  }
}

function verifyLabelToken(labelToken, visit) {
  const token = String(labelToken || "");
  if (!token) return false;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return (
      payload?.purpose === "visit-label" &&
      Number(payload?.visitId) === Number(visit.id) &&
      Number(payload?.branchId) === Number(visit.branchId)
    );
  } catch {
    return false;
  }
}

function parseVisitId(value) {
  if (value && typeof value === "object") return idParamSchema.parse(value).id;
  return idParamSchema.parse({ id: String(value) }).id;
}

export async function createLabelToken({ user, visitId }) {
  const id = parseVisitId(visitId);

  const visit = await prisma.visit.findUnique({
    where: { id },
    select: { id: true, branchId: true },
  });

  if (!visit) return { ok: false, status: 404, message: "Visita nao encontrada" };
  if (!userCanAccessVisit(user, visit)) {
    return { ok: false, status: 403, message: "Acesso negado" };
  }

  const token = jwt.sign(
    {
      purpose: "visit-label",
      visitId: visit.id,
      branchId: visit.branchId,
    },
    process.env.JWT_SECRET,
    { expiresIn: LABEL_TOKEN_TTL_SECONDS }
  );

  return { ok: true, token, expiresInSeconds: LABEL_TOKEN_TTL_SECONDS };
}

export async function checkin({ user, input }) {
  const data = checkinSchema.parse(input);

  const branchId = Number(user?.branchId);
  if (!branchId) {
    return { ok: false, status: 400, message: "Usuário sem filial vinculada" };
  }

  const visitor = await prisma.visitor.findUnique({
    where: { id: data.visitorId },
  });

  if (!visitor) {
    return { ok: false, status: 404, message: "Visitante não encontrado" };
  }

  const canAccessVisitor = await userCanAccessVisitor(user, visitor.id);
  if (!canAccessVisitor) {
    return { ok: false, status: 404, message: "Visitante nao encontrado" };
  }

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true },
  });

  if (!branch) {
    return { ok: false, status: 400, message: "Filial do usuário inválida" };
  }

  if (isVisitorRegistrationExpired(visitor)) {
    return {
      ok: false,
      status: 400,
      message: "Cadastro expirado. Atualização obrigatória.",
    };
  }

  const openVisit = await prisma.visit.findFirst({
    where: {
      visitorId: data.visitorId,
      checkoutAt: null,
      branchId: branch.id,
    },
  });

  if (openVisit) {
    return {
      ok: false,
      status: 400,
      message: "Visitante já possui visita em andamento.",
    };
  }

  const visit = await prisma.visit.create({
    data: {
      visitCode: numericCode(),
      visitorId: data.visitorId,
      branchId: branch.id,
      branchName: branch.name,
      serviceType: data.serviceType,
      attendedBy: data.attendedBy,
      areaToVisit: data.areaToVisit,
      checkinByUserId: user.id,
    },
  });

  return { ok: true, visit };
}

export async function getLabelData({ authorization, visitId, labelToken }) {
  const id = parseVisitId(visitId);

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      visitor: {
        select: {
          name: true,
          cpf: true,
          company: true,
        },
      },
      branch: { select: { id: true, name: true } },
    },
  });

  if (!visit) return { ok: false, status: 404, message: "Visita não encontrada" };

  const bearerUser = await getBearerUserFromToken(authorization);
  const hasBearerAccess = bearerUser && userCanAccessVisit(bearerUser, visit);
  const hasTokenAccess = verifyLabelToken(labelToken, visit);

  if (!hasBearerAccess && !hasTokenAccess) {
    return { ok: false, status: 404, message: "Visita nao encontrada" };
  }

  return { ok: true, visit };
}

export async function findOpenByCpf({ user, cpf }) {
  const parsedCpf = cpfSchema.parse(cpf);

  const visit = await prisma.visit.findFirst({
    where: {
      checkoutAt: null,
      visitor: { cpf: parsedCpf },
      branchId: user.branchId,
    },
    orderBy: { checkinAt: "desc" },
    select: {
      id: true,
      visitCode: true,
      checkinAt: true,
      visitor: { select: { name: true, cpf: true } },
    },
  });

  if (!visit) {
    return { ok: false, status: 404, message: "Nenhuma visita em aberto" };
  }

  return { ok: true, visit };
}

export async function getStatsByCpf({ user, cpf }) {
  const parsedCpf = cpfSchema.parse(cpf);
  const where = visitCpfWhere({ user, cpf: parsedCpf });

  const [total, open] = await Promise.all([
    prisma.visit.count({
      where,
    }),
    prisma.visit.count({
      where: { ...where, checkoutAt: null },
    }),
  ]);

  return { cpf: parsedCpf, total, open, closed: total - open };
}

export async function getRecentByCpf({ user, cpf, limit }) {
  const parsedCpf = cpfSchema.parse(cpf);
  const parsedLimit = boundedLimitQuery(20, 5).parse(limit);
  const where = visitCpfWhere({ user, cpf: parsedCpf });

  const items = await prisma.visit.findMany({
    where,
    orderBy: { checkinAt: "desc" },
    take: parsedLimit,
    select: {
      id: true,
      checkinAt: true,
      checkoutAt: true,
      branchName: true,
      attendedBy: true,
      serviceType: true,
      visitCode: true,
    },
  });

  return { cpf: parsedCpf, items };
}

export async function checkout({ user, input }) {
  const { visitCode } = checkoutSchema.parse(input);

  const visit = await prisma.visit.findFirst({
    where: {
      visitCode,
      checkoutAt: null,
      branchId: user.branchId,
    },
  });

  if (!visit) {
    return { ok: false, status: 404, message: "Visita em aberto não encontrada." };
  }

  const updated = await prisma.visit.update({
    where: { id: visit.id },
    data: {
      checkoutAt: new Date(),
      checkoutByUserId: user?.id ?? null,
    },
  });

  return { ok: true, visit: updated };
}

export async function getById({ user, visitId }) {
  const id = parseVisitId(visitId);

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      visitor: {
        select: {
          id: true,
          name: true,
          cpf: true,
          phone: true,
          company: true,
          photoUpdatedAt: true,
          documentFrontUpdatedAt: true,
          documentBackUpdatedAt: true,
        },
      },
      branch: { select: { id: true, name: true } },
      checkinByUser: { select: { id: true, username: true } },
      checkoutByUser: { select: { id: true, username: true } },
    },
  });

  if (!visit) return { ok: false, status: 404, message: "Visita não encontrada" };

  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";
  const sameBranch = Number(user?.branchId) === Number(visit.branch?.id);

  if (!isAdmin && !sameBranch) {
    return { ok: false, status: 404, message: "Visita nao encontrada" };
  }

  return { ok: true, visit };
}

export async function listOpen({ user }) {
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";
  const branchId = Number(user?.branchId);

  const where = { checkoutAt: null };

  if (!isAdmin) {
    if (!branchId) return { items: [] };
    where.branchId = branchId;
  }

  const items = await prisma.visit.findMany({
    where,
    orderBy: { checkinAt: "desc" },
    take: 50,
    select: {
      id: true,
      checkinAt: true,
      areaToVisit: true,
      attendedBy: true,
      serviceType: true,
      visitCode: true,
      branchId: true,
      branchName: true,
      visitor: {
        select: {
          name: true,
          cpf: true,
          company: true,
        },
      },
    },
  });

  return { items };
}
