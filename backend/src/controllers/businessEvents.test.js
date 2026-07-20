import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { login } from "./auth.controller.js";
import { requestContext } from "../middlewares/requestContext.js";
import { normalizeErrorResponses, errorHandler } from "../middlewares/errorHandler.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const VALID_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

async function withMocks(fn) {
  const originalFindUnique = prisma.user.findUnique;
  const originalCompare = bcrypt.compare;
  const originalSign = jwt.sign;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const entries = [];

  console.log = (line) => entries.push(line);
  console.warn = (line) => entries.push(line);
  jwt.sign = () => "signed-token";

  try {
    const result = await fn({ entries, setUser, setCompare });
    return { result, entries };
  } finally {
    prisma.user.findUnique = originalFindUnique;
    bcrypt.compare = originalCompare;
    jwt.sign = originalSign;
    console.log = originalLog;
    console.warn = originalWarn;
  }

  function setUser(user) {
    prisma.user.findUnique = async () => user;
  }

  function setCompare(replacement) {
    bcrypt.compare = replacement;
  }
}

async function requestLogin(body) {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use(normalizeErrorResponses);
  app.post("/login", login);
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": VALID_REQUEST_ID,
      },
      body: JSON.stringify(body),
    });
    return {
      response,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("login success emits a safe business event", async () => {
  const { result, entries } = await withMocks(({ setUser, setCompare }) => {
    setUser({
      id: 7,
      username: "alice",
      passwordHash: "hash",
      role: "ADMIN",
      branchId: 2,
      isActive: true,
      branch: { id: 2, name: "Matriz" },
    });
    setCompare(async () => true);
    return requestLogin({ username: "alice", password: "valid-password" });
  });

  assert.equal(result.response.status, 200);

  const event = entries.map((line) => JSON.parse(line)).find((log) => log.event === "auth_login_success");
  assert.equal(event.requestId, VALID_REQUEST_ID);
  assert.equal(event.userId, 7);
  assert.equal(event.branchId, 2);
  assert.equal(JSON.stringify(event).includes("alice"), false);
  assert.equal(JSON.stringify(event).includes("valid-password"), false);
});

test("login failure emits a safe warning event", async () => {
  const { result, entries } = await withMocks(({ setUser, setCompare }) => {
    setUser({
      id: 7,
      username: "alice",
      passwordHash: "hash",
      role: "ADMIN",
      branchId: 2,
      isActive: true,
      branch: { id: 2, name: "Matriz" },
    });
    setCompare(async () => false);
    return requestLogin({ username: "alice", password: "wrong-password" });
  });

  assert.equal(result.response.status, 401);

  const event = entries.map((line) => JSON.parse(line)).find((log) => log.event === "auth_login_failed");
  assert.equal(event.requestId, VALID_REQUEST_ID);
  assert.equal(event.reason, "invalid_credentials");
  assert.equal(JSON.stringify(event).includes("alice"), false);
  assert.equal(JSON.stringify(event).includes("wrong-password"), false);
});
