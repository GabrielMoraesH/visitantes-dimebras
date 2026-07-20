import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { requestContext, isSafeRequestId } from "./requestContext.js";
import { httpLogger } from "./httpLogger.js";
import { errorHandler, normalizeErrorResponses, notFoundHandler } from "./errorHandler.js";

const VALID_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

async function withCapturedConsole(methods, fn) {
  const originals = new Map();
  const entries = [];

  for (const method of methods) {
    originals.set(method, console[method]);
    console[method] = (line) => entries.push({ method, line });
  }

  try {
    const result = await fn(entries);
    return { result, entries };
  } finally {
    for (const [method, original] of originals) {
      console[method] = original;
    }
  }
}

async function request(configure, path = "/test", options = {}) {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use(normalizeErrorResponses);
  app.use(httpLogger);
  configure(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
    const text = await response.text();
    return {
      response,
      body: text ? JSON.parse(text) : null,
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("request without X-Request-Id receives a generated UUID", async () => {
  const { result } = await withCapturedConsole(["log"], () =>
    request((app) => {
      app.get("/test", (req, res) => res.json({ requestId: req.requestId }));
    })
  );

  const requestId = result.response.headers.get("x-request-id");
  assert.equal(isSafeRequestId(requestId), true);
  assert.equal(result.body.requestId, requestId);
});

test("valid X-Request-Id is preserved", async () => {
  const { result } = await withCapturedConsole(["log"], () =>
    request(
      (app) => {
        app.get("/test", (req, res) => res.json({ requestId: req.requestId }));
      },
      "/test",
      { headers: { "X-Request-Id": VALID_REQUEST_ID } }
    )
  );

  assert.equal(result.response.headers.get("x-request-id"), VALID_REQUEST_ID);
  assert.equal(result.body.requestId, VALID_REQUEST_ID);
});

test("invalid request ids, including CR/LF, are rejected", async () => {
  assert.equal(isSafeRequestId("not a uuid"), false);
  assert.equal(isSafeRequestId(`${VALID_REQUEST_ID}\r\nx: y`), false);

  const { result } = await withCapturedConsole(["log"], () =>
    request(
      (app) => {
        app.get("/test", (req, res) => res.json({ requestId: req.requestId }));
      },
      "/test",
      { headers: { "X-Request-Id": "not-a-uuid" } }
    )
  );

  assert.notEqual(result.response.headers.get("x-request-id"), "not-a-uuid");
  assert.equal(isSafeRequestId(result.response.headers.get("x-request-id")), true);
});

test("X-Request-Id appears on error and reaches the error handler log", async () => {
  const { result, entries } = await withCapturedConsole(["warn", "error"], () =>
    request(
      (app) => {
        app.get("/test", () => {
          throw new Error("database://secret?token=hidden");
        });
      },
      "/test?token=hidden",
      { headers: { "X-Request-Id": VALID_REQUEST_ID } }
    )
  );

  assert.equal(result.response.status, 500);
  assert.equal(result.response.headers.get("x-request-id"), VALID_REQUEST_ID);
  assert.equal(JSON.stringify(result.body).includes("stack"), false);

  const errorLog = entries.map((entry) => JSON.parse(entry.line)).find((entry) => entry.event === "api_error");
  assert.equal(errorLog.requestId, VALID_REQUEST_ID);
  assert.equal(errorLog.route, "/test");
  assert.equal(JSON.stringify(errorLog).includes("token=hidden"), false);
  assert.equal(JSON.stringify(errorLog).includes("database://secret"), false);
});

test("HTTP logger emits one structured line without query token or Authorization", async () => {
  const { entries } = await withCapturedConsole(["log"], () =>
    request(
      (app) => {
        app.get("/test", (req, res, next) => {
          req.user = { id: 10, branchId: 2 };
          next();
        }, (req, res) => res.json({ ok: true }));
      },
      "/test?token=secret",
      {
        headers: {
          "X-Request-Id": VALID_REQUEST_ID,
          Authorization: "Bearer secret",
        },
      }
    )
  );

  assert.equal(entries.length, 1);
  const log = JSON.parse(entries[0].line);
  assert.equal(log.event, "http_request");
  assert.equal(log.requestId, VALID_REQUEST_ID);
  assert.equal(log.method, "GET");
  assert.equal(log.route, "/test");
  assert.equal(log.status, 200);
  assert.equal(typeof log.durationMs, "number");
  assert.equal(log.userId, 10);
  assert.equal(log.branchId, 2);
  assert.equal(JSON.stringify(log).includes("secret"), false);
  assert.equal(JSON.stringify(log).includes("Authorization"), false);
});

test("HTTP logger does not log unmatched path segments", async () => {
  const { entries } = await withCapturedConsole(["log"], () =>
    request(
      () => {},
      "/missing/12345678901?token=secret",
      { headers: { "X-Request-Id": VALID_REQUEST_ID } }
    )
  );

  const log = entries.map((entry) => JSON.parse(entry.line)).find((entry) => entry.event === "http_request");
  assert.equal(log.status, 404);
  assert.equal(log.route, "[unmatched]");
  assert.equal(JSON.stringify(log).includes("12345678901"), false);
  assert.equal(JSON.stringify(log).includes("secret"), false);
});

test("error logs use route patterns instead of sensitive path params", async () => {
  const { entries } = await withCapturedConsole(["log"], () =>
    request(
      (app) => {
        app.get("/visitor/:cpf", () => {
          throw Object.assign(new Error("invalid cpf"), { statusCode: 400 });
        });
      },
      "/visitor/12345678901",
      { headers: { "X-Request-Id": VALID_REQUEST_ID } }
    )
  );

  const log = entries.map((entry) => JSON.parse(entry.line)).find((entry) => entry.event === "api_error");
  assert.equal(log.route, "/visitor/:cpf");
  assert.equal(JSON.stringify(log).includes("12345678901"), false);
});
