import * as agendaService from "../services/agenda.service.js";

function zodToIssues(err) {
  return (
    err?.issues?.map((i) => ({
      path: i.path?.join(".") || "",
      message: i.message,
    })) || []
  );
}

function agendaErrorStatus(result) {
  if (result.reason === "not-found" || result.reason === "branch-not-found") return 404;
  return 400;
}

// ==========================
// LISTAR EVENTOS
// ==========================

export async function listEvents(req, res) {
  try {
    const events = await agendaService.listEvents({
      user: req.user,
      query: req.query,
    });

    return res.json(events);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Erro interno.",
    });
  }
}

export async function listPublicTvNowEvents(req, res) {
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
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Parametros invalidos.",
        issues: zodToIssues(err),
      });
    }

    console.error(err);

    return res.status(500).json({
      message: "Erro interno.",
    });
  }
}

// ==========================
// CRIAR EVENTO
// ==========================

export async function createEvent(req, res) {
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

    return res.status(201).json(result.event);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inv\u00e1lidos.",
        issues: zodToIssues(err),
      });
    }

    console.error(err);

    return res.status(500).json({
      message: "Erro interno.",
    });
  }
}

export async function updateEvent(req, res) {
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

    return res.json(result.event);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Erro ao atualizar agendamento.",
    });
  }
}

export async function cancelEvent(req, res) {
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

    return res.json(result.event);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Erro ao cancelar agendamento.",
    });
  }
}
