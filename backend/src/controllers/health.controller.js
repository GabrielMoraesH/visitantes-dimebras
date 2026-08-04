import * as healthService from "../services/health.service.js";

export async function health(req, res, next) {
  try {
    const result = await healthService.getHealthStatus();
    res.setHeader("Cache-Control", "no-store");
    return res.status(result.httpStatus).json(result.body);
  } catch (err) {
    return next(err);
  }
}
