import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { ALL_USER_ROLES, USER_ROLES } from "../constants/roles.js";
import { getJwtSecret, sessionJwtVerifyOptions } from "../config/auth.js";
import { forbidden, unauthorized } from "../utils/errors.js";

export async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(unauthorized("Token ausente", "AUTH_REQUIRED"));
  }

  const token = header.slice("Bearer ".length);
  let payload;

  try {
    payload = jwt.verify(token, getJwtSecret(), sessionJwtVerifyOptions());
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      return next(unauthorized("Token expirado", "TOKEN_EXPIRED"));
    }
    return next(unauthorized("Token inválido", "INVALID_TOKEN"));
  }

  try {
    const id = Number(payload.sub);

    if (!Number.isInteger(id) || id <= 0) {
      return next(unauthorized("Token inválido", "INVALID_TOKEN"));
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        branchId: true,
        isActive: true,
        branch: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!user || user.isActive !== true) {
      return next(unauthorized("Usuário não autorizado", "USER_INACTIVE"));
    }

    if (!ALL_USER_ROLES.includes(user.role)) {
      return next(unauthorized("Usuário não autorizado", "USER_INACTIVE"));
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

export function adminOnly(req, res, next) {
  return authorizeRoles(USER_ROLES.ADMIN)(req, res, next);
}

export function authorizeRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles.map((role) => String(role).toUpperCase()));

  return function authorizeRole(req, res, next) {
    if (!req.user) {
      return next(unauthorized("Token ausente", "AUTH_REQUIRED"));
    }

    const role = String(req.user?.role || "").toUpperCase();
    if (!allowed.has(role)) {
      return next(forbidden("Acesso negado", "FORBIDDEN"));
    }

    return next();
  };
}
