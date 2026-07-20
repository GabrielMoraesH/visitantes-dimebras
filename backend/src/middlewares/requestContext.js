import { randomUUID } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeRequestId(value) {
  const requestId = String(value || "");
  return requestId.length <= 36 && UUID_PATTERN.test(requestId);
}

export function requestContext(req, res, next) {
  const incomingRequestId = req.get("X-Request-Id");
  const requestId = isSafeRequestId(incomingRequestId) ? incomingRequestId : randomUUID();

  req.requestId = requestId;
  req.requestStartedAt = performance.now();
  res.setHeader("X-Request-Id", requestId);

  next();
}
