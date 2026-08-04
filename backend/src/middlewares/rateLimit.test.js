import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { errorHandler, normalizeErrorResponses, notFoundHandler } from "./errorHandler.js";

const RATE_LIMIT_MESSAGE = "Muitas tentativas de login. Tente novamente em alguns minutos.";

async function createApp({ trustProxy = 1 } = {}) {
  const { loginRateLimit } = await import(`./rateLimit.js?test=${Date.now()}-${Math.random()}`);
  const app = express();

  app.set("trust proxy", trustProxy);
  app.use(express.json());
  app.use(normalizeErrorResponses);
  app.post("/auth/login", loginRateLimit, (req, res) => {
    res.json({ ok: true, ip: req.ip });
  });
  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function postLogin(baseUrl, { ip } = {}) {
  const headers = { "content-type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;

  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username: "admin", password: "senha-valida" }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { response, body };
}

test("login rate limit allows requests below the limit and keeps standard headers", async () => {
  const app = await createApp();
  try {
    const { response, body } = await postLogin(app.url, { ip: "203.0.113.10" });

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, ip: "203.0.113.10" });
    assert.equal(response.headers.get("ratelimit-limit"), "10");
    assert.equal(response.headers.get("ratelimit-remaining"), "9");
    assert.equal(response.headers.get("ratelimit-policy"), "10;w=900");
    assert.equal(response.headers.has("x-ratelimit-limit"), false);
    assert.equal(response.headers.has("x-ratelimit-remaining"), false);
  } finally {
    await app.close();
  }
});

test("login rate limit keeps the tenth attempt allowed and blocks the next one with the same message", async () => {
  const app = await createApp();
  try {
    let tenth;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      tenth = await postLogin(app.url, { ip: "203.0.113.20" });
    }

    assert.equal(tenth.response.status, 200);
    assert.equal(tenth.response.headers.get("ratelimit-limit"), "10");
    assert.equal(tenth.response.headers.get("ratelimit-remaining"), "0");
    assert.equal(tenth.response.headers.get("ratelimit-policy"), "10;w=900");

    const blocked = await postLogin(app.url, { ip: "203.0.113.20" });

    assert.equal(blocked.response.status, 429);
    assert.equal(blocked.body.message, RATE_LIMIT_MESSAGE);
    assert.equal(blocked.response.headers.get("ratelimit-limit"), "10");
    assert.equal(blocked.response.headers.get("ratelimit-remaining"), "0");
    assert.equal(blocked.response.headers.get("ratelimit-policy"), "10;w=900");
    assert.equal(blocked.response.headers.has("x-ratelimit-limit"), false);
    assert.equal(blocked.response.headers.has("x-ratelimit-remaining"), false);
  } finally {
    await app.close();
  }
});

test("login rate limit keeps counters separate for different client IPs behind the trusted proxy", async () => {
  const app = await createApp();
  try {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await postLogin(app.url, { ip: "203.0.113.30" });
      assert.equal(response.response.status, 200);
    }

    const otherIp = await postLogin(app.url, { ip: "203.0.113.31" });

    assert.equal(otherIp.response.status, 200);
    assert.equal(otherIp.body.ip, "203.0.113.31");
  } finally {
    await app.close();
  }
});

test("login rate limit preserves IPv4 req.ip behavior through the existing trust proxy setting", async () => {
  const app = await createApp();
  try {
    const { response, body } = await postLogin(app.url, { ip: "198.51.100.40" });

    assert.equal(response.status, 200);
    assert.equal(body.ip, "198.51.100.40");
  } finally {
    await app.close();
  }
});

test("login rate limit safely normalizes IPv6 clients within the default subnet", async () => {
  const app = await createApp();
  try {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const ip = attempt % 2 === 0 ? "2001:db8:abcd:1200::1" : "2001:db8:abcd:12ff::2";
      const response = await postLogin(app.url, { ip });
      assert.equal(response.response.status, 200);
    }

    const blocked = await postLogin(app.url, { ip: "2001:db8:abcd:12aa::3" });

    assert.equal(blocked.response.status, 429);
    assert.equal(blocked.body.message, RATE_LIMIT_MESSAGE);
  } finally {
    await app.close();
  }
});

test("login rate limit does not interfere with routes where the middleware is not mounted", async () => {
  const app = await createApp();
  try {
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      await postLogin(app.url, { ip: "203.0.113.50" });
    }

    const response = await fetch(`${app.url}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
  } finally {
    await app.close();
  }
});
