import * as healthService from "../services/health.service.js";

export function live(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, message: "Backend rodando ✅" });
}

export async function ready(req, res, next) {
  try {
    const result = await healthService.readiness();
    res.setHeader("Cache-Control", "no-store");
    return res.status(result.ok ? 200 : 503).json({
      ok: result.ok,
      database: result.database,
      storage: result.storage,
    });
  } catch (err) {
    return next(err);
  }
}
