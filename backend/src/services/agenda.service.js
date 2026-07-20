import { z } from "zod";
import prisma from "../lib/prisma.js";
import {
  dateOnlySchema,
  dateTimeSchema,
  idParamSchema,
  LIMITS,
  positiveIntQuery,
  trimmedString,
} from "../utils/validation.js";

const asString = (v) => (v === null || v === undefined ? "" : String(v));
const PAST_AGENDA_MESSAGE =
  "N\u00e3o \u00e9 permitido agendar uma visita para uma data ou hor\u00e1rio anterior ao momento atual.";

const createAgendaSchema = z.object({
  visitorName: z.preprocess(
    asString,
    trimmedString(LIMITS.agendaText, "Informe o nome do visitante.").min(2, "Informe o nome do visitante.")
  ),
  company: z.preprocess(
    asString,
    trimmedString(LIMITS.agendaText, "Informe a empresa.").min(2, "Informe a empresa.")
  ),
  eventWith: z.preprocess(
    asString,
    trimmedString(LIMITS.agendaText, "Informe com quem sera o evento.").min(2, "Informe com quem sera o evento.")
  ),
  department: z.preprocess(
    asString,
    trimmedString(LIMITS.agendaText, "Informe o setor.").min(2, "Informe o setor.")
  ),
  eventDateTime: z.preprocess(asString, dateTimeSchema),
  observation: z.preprocess(asString, z.string().trim().max(LIMITS.agendaObservation)).optional(),
}).strict();

const publicTvNowSchema = z.object({
  branchId: positiveIntQuery("branchId"),
}).strict();

const listEventsQuerySchema = z.object({
  date: dateOnlySchema.optional(),
}).strict();

function validateFutureDate(eventDate) {
  if (eventDate < new Date()) {
    return PAST_AGENDA_MESSAGE;
  }

  return null;
}

function parseAgendaId(eventId) {
  if (eventId && typeof eventId === "object") return idParamSchema.parse(eventId).id;
  return idParamSchema.parse({ id: String(eventId) }).id;
}

function buildDayRange(date) {
  if (date) {
    const [year, month, day] = date.split("-").map(Number);

    return {
      startOfDay: new Date(year, month - 1, day, 0, 0, 0, 0),
      endOfDay: new Date(year, month - 1, day, 23, 59, 59, 999),
    };
  }

  const today = new Date();

  return {
    startOfDay: new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0,
      0
    ),
    endOfDay: new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999
    ),
  };
}

function parseAgendaInput(input) {
  const data = createAgendaSchema.parse(input);
  const eventDate = new Date(data.eventDateTime);

  if (isNaN(eventDate.getTime())) {
    return { ok: false, reason: "invalid-date", message: "Data do evento inv\u00e1lida." };
  }

  const eventDateError = validateFutureDate(eventDate);

  if (eventDateError) {
    return { ok: false, reason: "past-date", message: eventDateError };
  }

  return { ok: true, data, eventDate };
}

function buildAgendaData({ data, eventDate }) {
  return {
    visitorName: data.visitorName,
    company: data.company,
    eventWith: data.eventWith,
    department: data.department,
    eventDateTime: eventDate,
    observation: data.observation || null,
  };
}

async function findAccessibleEvent({ user, eventId }) {
  const id = parseAgendaId(eventId);

  const event = await prisma.agendaEvent.findFirst({
    where: {
      id,
      branchId: user.branchId,
    },
  });

  if (!event) {
    return { ok: false, reason: "not-found", message: "Agendamento n\u00e3o encontrado." };
  }

  return { ok: true, event };
}

export async function listEvents({ user, query }) {
  const { date } = listEventsQuerySchema.parse(query);
  const { startOfDay, endOfDay } = buildDayRange(date);

  const events = await prisma.agendaEvent.findMany({
    where: {
      branchId: user.branchId,
      eventDateTime: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      eventDateTime: "asc",
    },
  });

  return events;
}

export async function listPublicTvNowEvents({ query }) {
  if (!query.branchId) {
    return {
      ok: false,
      reason: "missing-branch",
      message: "Filial obrigat\u00f3ria para exibi\u00e7\u00e3o da TV.",
    };
  }

  const { branchId } = publicTvNowSchema.parse(query);
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });

  if (!branch) {
    return { ok: false, reason: "branch-not-found", message: "Filial n\u00e3o encontrada." };
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

  return { ok: true, events };
}

export async function createEvent({ user, input }) {
  const parsed = parseAgendaInput(input);
  if (!parsed.ok) return parsed;

  const event = await prisma.agendaEvent.create({
    data: {
      ...buildAgendaData(parsed),
      branchId: user.branchId,
      createdById: user.id,
    },
  });

  return { ok: true, event };
}

export async function updateEvent({ user, eventId, input }) {
  const access = await findAccessibleEvent({ user, eventId });
  if (!access.ok) return access;

  const parsed = parseAgendaInput(input);
  if (!parsed.ok) return parsed;

  const event = await prisma.agendaEvent.update({
    where: {
      id: access.event.id,
    },
    data: buildAgendaData(parsed),
  });

  return { ok: true, event };
}

export async function cancelEvent({ user, eventId }) {
  const access = await findAccessibleEvent({ user, eventId });
  if (!access.ok) return access;

  const event = await prisma.agendaEvent.update({
    where: {
      id: access.event.id,
    },
    data: {
      status: "CANCELADO",
    },
  });

  return { ok: true, event };
}
