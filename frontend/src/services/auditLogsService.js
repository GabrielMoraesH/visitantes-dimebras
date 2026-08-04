import api from "./api";
import { buildAuditLogParams } from "../utils/auditLogs";

export function getAuditLogs(filters, page, pageSize) {
  return api.get("/audit-logs", {
    params: buildAuditLogParams(filters, page, pageSize),
  });
}
