import { logInfo, logWarn } from "../utils/logger.js";

function routePath(req) {
  const baseUrl = req.baseUrl || "";
  const route = req.route?.path;

  if (typeof route === "string") return `${baseUrl}${route}` || req.path || "/";
  if (route instanceof RegExp) return `${baseUrl}${route.toString()}`;
  return req.path ? "[unmatched]" : req.url?.split("?")[0] || "/";
}

export function httpLogger(req, res, next) {
  const startedAt = req.requestStartedAt ?? performance.now();
  let logged = false;

  function logRequest(event = "http_request") {
    if (logged) return;
    logged = true;

    const elapsedMs = performance.now() - startedAt;
    const durationMs = Number.isFinite(elapsedMs)
      ? Math.max(0, Math.round(elapsedMs * 100) / 100)
      : 0;
    const data = {
      requestId: req.requestId,
      method: req.method,
      route: routePath(req),
      status: res.statusCode,
      durationMs,
      userId: req.user?.id ?? null,
      branchId: req.user?.branchId ?? null,
    };

    if (res.statusCode >= 400) {
      logWarn(event, data);
      return;
    }

    logInfo(event, data);
  }

  res.on("finish", () => logRequest());
  res.on("close", () => {
    if (!res.writableEnded) logRequest("http_request_aborted");
  });

  next();
}
