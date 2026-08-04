import * as agendaService from "../services/agenda.service.js";
import { auditRequestContext, safeAuditLog } from "../utils/audit.js";

function agendaErrorStatus(result) {
  if (result.reason === "not-found" || result.reason === "branch-not-found") return 404;
  return 400;
}

// ==========================
// LISTAR EVENTOS
// ==========================

export async function listEvents(req, res, next) {
  try {
    const events = await agendaService.listEvents({
      user: req.user,
      query: req.query,
    });

    return res.json(events);
  } catch (error) {
    return next(error);
  }
}

export async function listPublicTvNowEvents(req, res, next) {
  try {
    const result = await agendaService.listPublicTvNowEvents({
      query: req.query,
    });

    if (!result.ok) {
      return res.status(agendaErrorStatus(result)).json({
        message: result.message,
      });
    }

    return res.json(result.events);
  } catch (error) {
    return next(error);
  }
}

// ==========================
// CRIAR EVENTO
// ==========================

export async function createEvent(req, res, next) {
  try {
    const result = await agendaService.createEvent({
      user: req.user,
      input: req.body,
    });

    if (!result.ok) {
      return res.status(agendaErrorStatus(result)).json({
        message: result.message,
      });
    }

    await safeAuditLog({
      ...auditRequestContext(req),
      branchId: result.event.branchId,
      action: "AGENDA_EVENT_CREATE",
      entity: "AGENDA_EVENT",
      entityId: String(result.event.id),
      description: "Evento de agenda criado",
      metadata: result.audit,
    });

    return res.status(201).json(result.event);
  } catch (error) {
    return next(error);
  }
}

export async function updateEvent(req, res, next) {
  try {
    const result = await agendaService.updateEvent({
      user: req.user,
      eventId: req.params,
      input: req.body,
    });

    if (!result.ok) {
      return res.status(agendaErrorStatus(result)).json({
        message: result.message,
      });
    }

    if (result.auditShouldLog) {
      await safeAuditLog({
        ...auditRequestContext(req),
        branchId: result.event.branchId,
        action: "AGENDA_EVENT_UPDATE",
        entity: "AGENDA_EVENT",
        entityId: String(result.event.id),
        description: "Evento de agenda atualizado",
        metadata: result.audit,
      });
    }

    return res.json(result.event);
  } catch (error) {
    return next(error);
  }
}

export async function cancelEvent(req, res, next) {
  try {
    const result = await agendaService.cancelEvent({
      user: req.user,
      eventId: req.params,
    });

    if (!result.ok) {
      return res.status(agendaErrorStatus(result)).json({
        message: result.message,
      });
    }

    if (result.auditShouldLog) {
      await safeAuditLog({
        ...auditRequestContext(req),
        branchId: result.event.branchId,
        action: "AGENDA_EVENT_DEACTIVATE",
        entity: "AGENDA_EVENT",
        entityId: String(result.event.id),
        description: "Evento de agenda desativado",
        metadata: result.audit,
      });
    }

    return res.json(result.event);
  } catch (error) {
    return next(error);
  }
}
