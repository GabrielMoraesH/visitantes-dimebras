import prisma from "../lib/prisma.js";
import { z } from "zod";

function zodToIssues(err) {
  return (
    err?.issues?.map((i) => ({
      path: i.path?.join(".") || "",
      message: i.message,
    })) || []
  );
}

const asString = (v) => (v === null || v === undefined ? "" : String(v));
const PAST_AGENDA_MESSAGE =
  "N\u00e3o \u00e9 permitido agendar uma visita para uma data ou hor\u00e1rio anterior ao momento atual.";

const createAgendaSchema = z.object({
  visitorName: z.preprocess(
    asString,
    z.string().trim().min(2, "Informe o nome do visitante.")
  ),

  company: z.preprocess(
    asString,
    z.string().trim().min(2, "Informe a empresa.")
  ),

  eventWith: z.preprocess(
    asString,
    z.string().trim().min(2, "Informe com quem será o evento.")
  ),

  department: z.preprocess(
    asString,
    z.string().trim().min(2, "Informe o setor.")
  ),

  eventDateTime: z.preprocess(
    asString,
    z.string().min(1, "Informe a data e hora do evento.")
  ),

  observation: z.preprocess(asString, z.string()).optional(),
});

const publicTvNowSchema = z.object({
  branchId: z.coerce.number().int().positive(),
});

function validateFutureDate(eventDate) {
  if (eventDate < new Date()) {
    return PAST_AGENDA_MESSAGE;
  }

  return null;
}

// ==========================
// LISTAR EVENTOS
// ==========================

export async function listEvents(req, res) {
  try {
    const { date } = req.query;

    let startOfDay;
    let endOfDay;

    if (date) {
      const [year, month, day] = date.split("-").map(Number);

      startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
    } else {
      const today = new Date();

      startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        0,
        0,
        0,
        0
      );

      endOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      );
    }

    console.log("Filtro:", startOfDay, endOfDay);

    const events = await prisma.agendaEvent.findMany({
      where: {
        branchId: req.user.branchId,
        eventDateTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        eventDateTime: "asc",
      },
    });

    console.log("Encontrados:", events.length);

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
    if (!req.query.branchId) {
      return res.status(400).json({
        message: "Filial obrigatória para exibição da TV.",
      });
    }

    const { branchId } = publicTvNowSchema.parse(req.query);
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });

    if (!branch) {
      return res.status(404).json({
        message: "Filial não encontrada.",
      });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - 10 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 10 * 60 * 1000);

    const events = await prisma.agendaEvent.findMany({
      where: {
        status: "AGENDADO",
        branchId,
        eventDateTime: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: [{ eventDateTime: "asc" }, { visitorName: "asc" }],
      select: {
        id: true,
        visitorName: true,
        eventDateTime: true,
      },
    });

    return res.json(events);
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
    const data = createAgendaSchema.parse(req.body);

    // Valida se a data é válida
    const eventDate = new Date(data.eventDateTime);

    if (isNaN(eventDate.getTime())) {
      return res.status(400).json({
        message: "Data do evento inválida.",
      });
    }

    const eventDateError = validateFutureDate(eventDate);

    if (eventDateError) {
      return res.status(400).json({
        message: eventDateError,
      });
    }

    const event = await prisma.agendaEvent.create({
      data: {
        visitorName: data.visitorName,
        company: data.company,
        eventWith: data.eventWith,
        department: data.department,
        eventDateTime: eventDate,
        observation: data.observation || null,

        branchId: req.user.branchId,
        createdById: req.user.id,
      },
    });

    return res.status(201).json(event);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inválidos.",
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
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID inválido.",
      });
    }

    const existingEvent = await prisma.agendaEvent.findFirst({
      where: {
        id,
        branchId: req.user.branchId,
      },
    });

    if (!existingEvent) {
      return res.status(404).json({
        message: "Agendamento não encontrado.",
      });
    }

    const data = createAgendaSchema.parse(req.body);

    const eventDate = new Date(data.eventDateTime);

    if (isNaN(eventDate.getTime())) {
      return res.status(400).json({
        message: "Data do evento inválida.",
      });
    }

    const eventDateError = validateFutureDate(eventDate);

    if (eventDateError) {
      return res.status(400).json({
        message: eventDateError,
      });
    }

    const event = await prisma.agendaEvent.update({
      where: {
        id: existingEvent.id,
      },
      data: {
        visitorName: data.visitorName,
        company: data.company,
        eventWith: data.eventWith,
        department: data.department,
        eventDateTime: eventDate,
        observation: data.observation || null,
      },
    });

    return res.json(event);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Erro ao atualizar agendamento.",
    });
  }
}

export async function cancelEvent(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID inválido.",
      });
    }

    const existingEvent = await prisma.agendaEvent.findFirst({
      where: {
        id,
        branchId: req.user.branchId,
      },
    });

    if (!existingEvent) {
      return res.status(404).json({
        message: "Agendamento não encontrado.",
      });
    }

    const event = await prisma.agendaEvent.update({
      where: {
        id: existingEvent.id,
      },
      data: {
        status: "CANCELADO",
      },
    });

    return res.json(event);

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Erro ao cancelar agendamento.",
    });
  }
}
