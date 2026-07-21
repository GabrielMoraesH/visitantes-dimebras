import test from "node:test";
import assert from "node:assert/strict";
import { validateJwtSecret } from "./auth.js";

test("validateJwtSecret rejects missing or blank JWT_SECRET", () => {
  const originalSecret = process.env.JWT_SECRET;

  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => validateJwtSecret(), /JWT_SECRET must be configured/);

    process.env.JWT_SECRET = "   ";
    assert.throws(() => validateJwtSecret(), /JWT_SECRET must be configured/);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test("validateJwtSecret accepts configured JWT_SECRET without changing it", () => {
  const originalSecret = process.env.JWT_SECRET;

  try {
    process.env.JWT_SECRET = "test-secret";
    assert.equal(validateJwtSecret(), "test-secret");
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
