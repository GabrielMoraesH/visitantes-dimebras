import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

export async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token ausente" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const id = Number(payload.sub ?? payload.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(401).json({ message: "Token invalido" });
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
      return res.status(401).json({ message: "Usuario nao autorizado" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }
}

export function adminOnly(req, res, next) {
  const role = String(req.user?.role || "").toUpperCase();
  if (role !== "ADMIN") {
    return res.status(403).json({ message: "Acesso negado" });
  }
  return next();
}
