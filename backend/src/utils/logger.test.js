import test from "node:test";
import assert from "node:assert/strict";
import { logError, logInfo, logWarn } from "./logger.js";

function capture(method, fn) {
  const original = console[method];
  const entries = [];
  console[method] = (line) => entries.push(line);

  try {
    fn(entries);
    return entries;
  } finally {
    console[method] = original;
  }
}

test("logger preserves required fields over data fields", () => {
  const entries = capture("log", () =>
    logInfo("real_event", {
      timestamp: "bad",
      level: "error",
      event: "fake_event",
      ok: true,
    })
  );

  const payload = JSON.parse(entries[0]);
  assert.equal(payload.event, "real_event");
  assert.equal(payload.level, "info");
  assert.notEqual(payload.timestamp, "bad");
  assert.equal(payload.ok, true);
});

test("logger fallback is safe for BigInt and circular data", () => {
  const circular = {};
  circular.self = circular;

  const entries = capture("log", () =>
    logWarn("unsafe_payload", {
      value: 1n,
      circular,
      password: "secret",
    })
  );

  const payload = JSON.parse(entries[0]);
  assert.equal(payload.event, "unsafe_payload");
  assert.equal(payload.level, "warn");
  assert.equal(payload.serializationFailed, true);
  assert.equal(JSON.stringify(payload).includes("secret"), false);
});

test("error logs use stderr", () => {
  const entries = capture("error", () => logError("technical_error", { code: "X" }));

  const payload = JSON.parse(entries[0]);
  assert.equal(payload.event, "technical_error");
  assert.equal(payload.level, "error");
});
