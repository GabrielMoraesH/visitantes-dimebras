import * as healthService from "../services/health.service.js";

function sendHealthResponse(res, result) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(result.httpStatus).json(result.body);
}

export async function health(req, res, next) {
  try {
    return sendHealthResponse(res, healthService.getLiveness());
  } catch (err) {
    return next(err);
  }
}

export async function ready(req, res, next) {
  try {
    const result = await healthService.getReadiness();
    return sendHealthResponse(res, result);
  } catch (err) {
    return next(err);
  }
}
