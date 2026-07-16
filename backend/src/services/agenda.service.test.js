import test from "node:test";
import assert from "node:assert/strict";
import prisma from "../lib/prisma.js";
import {
  cancelEvent,
  createEvent,
  listEvents,
  listPublicTvNowEvents,
  updateEvent,
} from "./agenda.service.js";

const user = { id: 10, role: "RECEPCAO", branchId: 1 };
const futureInput = {
  visitorName: "Visitante Teste",
  company: "Empresa Teste",
  eventWith: "Maria",
  department: "Recepcao",
  eventDateTime: "2026-07-16T15:30:00",
  observation: "Observacao",
};

function withPrismaMocks(mocks, fn) {
  const originals = [];

  for (const [model, methods] of Object.entries(mocks)) {
    for (const [method, replacement] of Object.entries(methods)) {
      originals.push([model, method, prisma[model][method]]);
      prisma[model][method] = replacement;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [model, method, original] of originals.reverse()) {
        prisma[model][method] = original;
      }
    });
}

function withFixedDate(isoDate, fn) {
  const RealDate = globalThis.Date;
  const fixedTime = new RealDate(isoDate).getTime();

  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedTime);
        return;
      }
      super(...args);
    }

    static now() {
      return fixedTime;
    }
  }

  globalThis.Date = FixedDate;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.Date = RealDate;
    });
}

test("listEvents uses authenticated branch, local day range and eventDateTime ascending order", async () => {
  let findManyArgs;
  const expectedEvents = [{ id: 1, visitorName: "Visitante" }];

  const events = await withPrismaMocks(
    {
      agendaEvent: {
        findMany: async (args) => {
          findManyArgs = args;
          return expectedEvents;
        },
      },
    },
    () =>
      listEvents({
        user,
        query: { date: "2026-07-16" },
      })
  );

  assert.equal(events, expectedEvents);
  assert.equal(findManyArgs.where.branchId, user.branchId);
  assert.deepEqual(findManyArgs.where.eventDateTime, {
    gte: new Date(2026, 6, 16, 0, 0, 0, 0),
    lte: new Date(2026, 6, 16, 23, 59, 59, 999),
  });
  assert.deepEqual(findManyArgs.orderBy, { eventDateTime: "asc" });
  assert.equal("select" in findManyArgs, false);
  assert.equal("include" in findManyArgs, false);
});

test("listEvents rejects client branchId query before Prisma", async () => {
  let findManyCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        agendaEvent: {
          findMany: async () => {
            findManyCalled = true;
            return [];
          },
        },
      },
      () => listEvents({ user, query: { date: "2026-07-16", branchId: "999" } })
    ),
    { name: "ZodError" }
  );

  assert.equal(findManyCalled, false);
});

test("listEvents rejects invalid query before Prisma", async () => {
  let findManyCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        agendaEvent: {
          findMany: async () => {
            findManyCalled = true;
            return [];
          },
        },
      },
      () => listEvents({ user, query: { date: "2026-02-31" } })
    ),
    { name: "ZodError" }
  );

  assert.equal(findManyCalled, false);
});

test("createEvent uses trusted user branch and creator and ignores protected client fields", async () => {
  let createArgs;
  const created = { id: 20, ...futureInput, branchId: 1, createdById: 10 };

  const result = await withFixedDate("2026-07-16T14:00:00", () =>
    withPrismaMocks(
      {
        agendaEvent: {
          create: async (args) => {
            createArgs = args;
            return created;
          },
        },
      },
      () =>
        createEvent({
          user,
          input: futureInput,
        })
    )
  );

  assert.deepEqual(result, { ok: true, event: created });
  assert.equal(createArgs.data.visitorName, futureInput.visitorName);
  assert.equal(createArgs.data.company, futureInput.company);
  assert.equal(createArgs.data.eventWith, futureInput.eventWith);
  assert.equal(createArgs.data.department, futureInput.department);
  assert.equal(createArgs.data.eventDateTime.getTime(), new Date(futureInput.eventDateTime).getTime());
  assert.equal(createArgs.data.observation, futureInput.observation);
  assert.equal(createArgs.data.branchId, user.branchId);
  assert.equal(createArgs.data.createdById, user.id);
  assert.deepEqual(Object.keys(createArgs.data).sort(), [
    "branchId",
    "company",
    "createdById",
    "department",
    "eventDateTime",
    "eventWith",
    "observation",
    "visitorName",
  ]);
});

test("createEvent rejects protected or unknown fields before Prisma", async () => {
  for (const protectedField of ["branchId", "createdById", "status", "unknownField"]) {
    let createCalled = false;

    await assert.rejects(
      withFixedDate("2026-07-16T14:00:00", () =>
        withPrismaMocks(
          {
            agendaEvent: {
              create: async () => {
                createCalled = true;
                return {};
              },
            },
          },
          () =>
            createEvent({
              user,
              input: { ...futureInput, [protectedField]: protectedField === "status" ? "CANCELADO" : 999 },
            })
        )
      ),
      { name: "ZodError" }
    );

    assert.equal(createCalled, false);
  }
});

test("createEvent accepts future date and rejects past date without Prisma", async () => {
  let createCalled = false;

  const futureResult = await withFixedDate("2026-07-16T14:00:00", () =>
    withPrismaMocks(
      {
        agendaEvent: {
          create: async () => {
            createCalled = true;
            return { id: 30 };
          },
        },
      },
      () => createEvent({ user, input: futureInput })
    )
  );

  assert.equal(futureResult.ok, true);
  assert.equal(createCalled, true);

  createCalled = false;
  const pastResult = await withFixedDate("2026-07-16T16:00:00", () =>
    withPrismaMocks(
      {
        agendaEvent: {
          create: async () => {
            createCalled = true;
            return {};
          },
        },
      },
      () => createEvent({ user, input: futureInput })
    )
  );

  assert.deepEqual(pastResult, {
    ok: false,
    reason: "past-date",
    message: "N\u00e3o \u00e9 permitido agendar uma visita para uma data ou hor\u00e1rio anterior ao momento atual.",
  });
  assert.equal(createCalled, false);
});

test("createEvent rejects invalid date before Prisma", async () => {
  let createCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        agendaEvent: {
          create: async () => {
            createCalled = true;
            return {};
          },
        },
      },
      () => createEvent({ user, input: { ...futureInput, eventDateTime: "data-invalida" } })
    ),
    { name: "ZodError" }
  );

  assert.equal(createCalled, false);
});

test("updateEvent searches by id and authenticated branch and updates allowed fields only", async () => {
  let findFirstArgs;
  let updateArgs;
  const updated = { id: 44, status: "AGENDADO" };

  const result = await withFixedDate("2026-07-16T14:00:00", () =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async (args) => {
            findFirstArgs = args;
            return { id: 44, branchId: user.branchId };
          },
          update: async (args) => {
            updateArgs = args;
            return updated;
          },
        },
      },
      () => updateEvent({ user, eventId: { id: "44" }, input: futureInput })
    )
  );

  assert.deepEqual(result, { ok: true, event: updated });
  assert.deepEqual(findFirstArgs.where, { id: 44, branchId: user.branchId });
  assert.deepEqual(updateArgs.where, { id: 44 });
  assert.equal(updateArgs.data.visitorName, futureInput.visitorName);
  assert.equal(updateArgs.data.company, futureInput.company);
  assert.equal(updateArgs.data.eventWith, futureInput.eventWith);
  assert.equal(updateArgs.data.department, futureInput.department);
  assert.equal(updateArgs.data.eventDateTime.getTime(), new Date(futureInput.eventDateTime).getTime());
  assert.equal(updateArgs.data.observation, futureInput.observation);
  assert.deepEqual(Object.keys(updateArgs.data).sort(), [
    "company",
    "department",
    "eventDateTime",
    "eventWith",
    "observation",
    "visitorName",
  ]);
});

test("updateEvent returns safe not found for another branch without updating", async () => {
  let updateCalled = false;

  const result = await withPrismaMocks(
    {
      agendaEvent: {
        findFirst: async () => null,
        update: async () => {
          updateCalled = true;
          return {};
        },
      },
    },
    () => updateEvent({ user, eventId: { id: "44" }, input: futureInput })
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "not-found",
    message: "Agendamento n\u00e3o encontrado.",
  });
  assert.equal(updateCalled, false);
});

test("updateEvent rejects invalid ID before Prisma", async () => {
  let findFirstCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => {
            findFirstCalled = true;
            return null;
          },
        },
      },
      () => updateEvent({ user, eventId: { id: "abc" }, input: futureInput })
    ),
    { name: "ZodError" }
  );

  assert.equal(findFirstCalled, false);
});

test("updateEvent preserves temporal validation before update", async () => {
  let updateCalled = false;

  const result = await withFixedDate("2026-07-16T16:00:00", () =>
    withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => ({ id: 44, branchId: user.branchId }),
          update: async () => {
            updateCalled = true;
            return {};
          },
        },
      },
      () => updateEvent({ user, eventId: { id: "44" }, input: futureInput })
    )
  );

  assert.equal(result.reason, "past-date");
  assert.equal(updateCalled, false);
});

test("cancelEvent searches by id and branch and only sets status to CANCELADO", async () => {
  let findFirstArgs;
  let updateArgs;
  const cancelled = { id: 55, status: "CANCELADO" };

  const result = await withPrismaMocks(
    {
      agendaEvent: {
        findFirst: async (args) => {
          findFirstArgs = args;
          return { id: 55, branchId: user.branchId, status: "AGENDADO" };
        },
        update: async (args) => {
          updateArgs = args;
          return cancelled;
        },
      },
    },
    () => cancelEvent({ user, eventId: { id: "55" } })
  );

  assert.deepEqual(result, { ok: true, event: cancelled });
  assert.deepEqual(findFirstArgs.where, { id: 55, branchId: user.branchId });
  assert.deepEqual(updateArgs, {
    where: { id: 55 },
    data: { status: "CANCELADO" },
  });
});

test("cancelEvent returns safe not found for another branch or missing event without updating", async () => {
  for (const existingEvent of [null, undefined]) {
    let updateCalled = false;

    const result = await withPrismaMocks(
      {
        agendaEvent: {
          findFirst: async () => existingEvent,
          update: async () => {
            updateCalled = true;
            return {};
          },
        },
      },
      () => cancelEvent({ user, eventId: { id: "55" } })
    );

    assert.deepEqual(result, {
      ok: false,
      reason: "not-found",
      message: "Agendamento n\u00e3o encontrado.",
    });
    assert.equal(updateCalled, false);
  }
});

test("cancelEvent preserves current behavior for already cancelled event", async () => {
  let updateCalled = false;

  const result = await withPrismaMocks(
    {
      agendaEvent: {
        findFirst: async () => ({ id: 55, branchId: user.branchId, status: "CANCELADO" }),
        update: async () => {
          updateCalled = true;
          return { id: 55, status: "CANCELADO" };
        },
      },
    },
    () => cancelEvent({ user, eventId: { id: "55" } })
  );

  assert.equal(result.ok, true);
  assert.equal(updateCalled, true);
});

test("listPublicTvNowEvents validates branch and preserves public query shape", async () => {
  let branchFindArgs;
  let findManyArgs;
  const events = [{ id: 70, visitorName: "Visitante", eventDateTime: new Date() }];

  const result = await withFixedDate("2026-07-16T15:00:00", () =>
    withPrismaMocks(
      {
        branch: {
          findUnique: async (args) => {
            branchFindArgs = args;
            return { id: 3 };
          },
        },
        agendaEvent: {
          findMany: async (args) => {
            findManyArgs = args;
            return events;
          },
        },
      },
      () => listPublicTvNowEvents({ query: { branchId: "3" } })
    )
  );

  assert.deepEqual(result, { ok: true, events });
  assert.deepEqual(branchFindArgs, { where: { id: 3 }, select: { id: true } });
  assert.equal(findManyArgs.where.status, "AGENDADO");
  assert.equal(findManyArgs.where.branchId, 3);
  assert.equal(
    findManyArgs.where.eventDateTime.gte.getTime(),
    new Date("2026-07-16T14:50:00").getTime()
  );
  assert.equal(
    findManyArgs.where.eventDateTime.lte.getTime(),
    new Date("2026-07-16T15:10:00").getTime()
  );
  assert.deepEqual(findManyArgs.orderBy, [{ eventDateTime: "asc" }, { visitorName: "asc" }]);
  assert.deepEqual(findManyArgs.select, {
    id: true,
    visitorName: true,
    eventDateTime: true,
  });
});

test("listPublicTvNowEvents rejects invalid branch before Prisma", async () => {
  let branchFindCalled = false;
  let eventFindCalled = false;

  await assert.rejects(
    withPrismaMocks(
      {
        branch: {
          findUnique: async () => {
            branchFindCalled = true;
            return null;
          },
        },
        agendaEvent: {
          findMany: async () => {
            eventFindCalled = true;
            return [];
          },
        },
      },
      () => listPublicTvNowEvents({ query: { branchId: "abc" } })
    ),
    { name: "ZodError" }
  );

  assert.equal(branchFindCalled, false);
  assert.equal(eventFindCalled, false);
});

test("listPublicTvNowEvents returns current errors for missing or nonexistent branch", async () => {
  const missing = await listPublicTvNowEvents({ query: {} });

  assert.deepEqual(missing, {
    ok: false,
    reason: "missing-branch",
    message: "Filial obrigat\u00f3ria para exibi\u00e7\u00e3o da TV.",
  });

  let eventFindCalled = false;
  const nonexistent = await withPrismaMocks(
    {
      branch: {
        findUnique: async () => null,
      },
      agendaEvent: {
        findMany: async () => {
          eventFindCalled = true;
          return [];
        },
      },
    },
    () => listPublicTvNowEvents({ query: { branchId: "999" } })
  );

  assert.deepEqual(nonexistent, {
    ok: false,
    reason: "branch-not-found",
    message: "Filial n\u00e3o encontrada.",
  });
  assert.equal(eventFindCalled, false);
});

test("technical Prisma errors are propagated by the service", async () => {
  const technicalError = new Error("database offline");

  await assert.rejects(
    withPrismaMocks(
      {
        agendaEvent: {
          findMany: async () => {
            throw technicalError;
          },
        },
      },
      () => listEvents({ user, query: { date: "2026-07-16" } })
    ),
    technicalError
  );
});
