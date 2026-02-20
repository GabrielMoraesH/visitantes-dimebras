import jwt from "jsonwebtoken";

export function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token ausente" });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const id = Number(payload.id ?? payload.sub);

    req.user = {
      id,
      role: payload.role,
      branchId: payload.branchId,
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }
}

export function adminOnly(req, res, next) {
  if (!req.user || Number(req.user.id) !== 1) {
    return res.status(403).json({ message: "Acesso negado" });
  }
  return next();
}
