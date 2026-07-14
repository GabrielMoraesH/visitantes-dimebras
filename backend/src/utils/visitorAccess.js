import prisma from "../lib/prisma.js";

function normalizeRole(role) {
  return String(role || "").toUpperCase();
}

function toPositiveInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseVisitorId(value) {
  return toPositiveInt(value);
}

export async function userCanAccessVisitor(user, visitorId) {
  const id = toPositiveInt(visitorId);
  if (!id) return false;

  const visitor = await prisma.visitor.findUnique({
    where: { id },
    select: {
      id: true,
      createdInBranchId: true,
    },
  });

  if (!visitor) return false;

  if (normalizeRole(user?.role) === "ADMIN") {
    return true;
  }

  const branchId = toPositiveInt(user?.branchId);
  if (!branchId) return false;

  if (Number(visitor.createdInBranchId) === branchId) {
    return true;
  }

  const visit = await prisma.visit.findFirst({
    where: {
      visitorId: id,
      branchId,
    },
    select: {
      id: true,
    },
  });

  return Boolean(visit);
}
