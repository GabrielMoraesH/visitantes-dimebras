import * as auditLogsService from "../services/auditLogs.service.js";

export async function listAuditLogs(req, res, next) {
  try {
    const result = await auditLogsService.listAuditLogs({
      actor: req.user,
      query: req.query,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
