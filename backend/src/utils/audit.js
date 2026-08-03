import AuditService from "../services/audit.service.js";
import { logError } from "./logger.js";

export function auditRequestContext(req) {
  return {
    userId: req.user?.id ?? undefined,
    branchId: req.user?.branchId ?? undefined,
    ipAddress: req.ip,
    userAgent: req.get?.("user-agent") ?? req.headers?.["user-agent"],
    requestId: req.requestId,
  };
}

// Audit is intentionally outside the business transaction. A logging failure
// must not roll back an operation that already completed successfully.
export async function safeAuditLog(input) {
  try {
    await AuditService.log(input);
  } catch (error) {
    logError("audit_log_failed", {
      action: input?.action,
      entity: input?.entity,
      requestId: input?.requestId,
      userId: input?.userId ?? null,
      branchId: input?.branchId ?? null,
      errorName: error?.name || "Error",
    });
  }
}
