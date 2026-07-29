import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_JWT, validateJwtSecret } from "./auth.js";

const VALID_32_CHAR_SECRET = "A3f9L2q8R7s6T5u4V3w2X1y0Z9b8C7d6";
const VALID_LONG_SECRET = "A3f9L2q8R7s6T5u4V3w2X1y0Z9b8C7d6E5f4";

function withJwtSecret(secret, fn) {
  const originalSecret = process.env.JWT_SECRET;

  try {
    if (secret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = secret;

    return fn();
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
}

test("validateJwtSecret rejects missing JWT_SECRET", () => {
  withJwtSecret(undefined, () => {
    assert.throws(() => validateJwtSecret(), /non-empty value/);
  });
});

test("validateJwtSecret rejects empty JWT_SECRET", () => {
  withJwtSecret("", () => {
    assert.throws(() => validateJwtSecret(), /non-empty value/);
  });
});

test("validateJwtSecret rejects whitespace-only JWT_SECRET", () => {
  withJwtSecret("   ", () => {
    assert.throws(() => validateJwtSecret(), /non-empty value/);
  });
});

test("validateJwtSecret rejects JWT_SECRET shorter than 32 characters", () => {
  withJwtSecret("short-secret-value", () => {
    assert.throws(() => validateJwtSecret(), /at least 32 characters/);
  });
});

test("validateJwtSecret rejects known placeholder JWT_SECRET", () => {
  withJwtSecret("change-me-use-a-long-random-secret", () => {
    assert.throws(() => validateJwtSecret(), /placeholder or example value/);
  });
});

test("validateJwtSecret rejects known placeholder JWT_SECRET regardless of case", () => {
  withJwtSecret("CHANGE-ME-USE-A-LONG-RANDOM-SECRET", () => {
    assert.throws(() => validateJwtSecret(), /placeholder or example value/);
  });
});

test("validateJwtSecret rejects known placeholder JWT_SECRET with surrounding whitespace", () => {
  withJwtSecret("  change-me-use-a-long-random-secret  ", () => {
    assert.throws(() => validateJwtSecret(), /placeholder or example value/);
  });
});

test("validateJwtSecret rejects current env example JWT_SECRET placeholder", () => {
  withJwtSecret("replace-with-a-random-secret-of-at-least-32-characters", () => {
    assert.throws(() => validateJwtSecret(), /placeholder or example value/);
  });
});

test("validateJwtSecret rejects repeated-character JWT_SECRET", () => {
  withJwtSecret("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", () => {
    assert.throws(() => validateJwtSecret(), /repeated-character/);
  });
});

test("validateJwtSecret accepts 32-character random JWT_SECRET without changing it", () => {
  withJwtSecret(VALID_32_CHAR_SECRET, () => {
    assert.equal(validateJwtSecret(), VALID_32_CHAR_SECRET);
  });
});

test("validateJwtSecret accepts longer random JWT_SECRET without changing it", () => {
  withJwtSecret(VALID_LONG_SECRET, () => {
    assert.equal(validateJwtSecret(), VALID_LONG_SECRET);
  });
});

test("validateJwtSecret does not expose JWT_SECRET in error messages", () => {
  const secret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  withJwtSecret(secret, () => {
    assert.throws(
      () => validateJwtSecret(),
      (error) => error instanceof Error && !error.message.includes(secret)
    );
  });
});

test("valid auth config preserves JWT algorithm, issuer, audience, and expiration", () => {
  withJwtSecret(VALID_LONG_SECRET, () => {
    assert.equal(validateJwtSecret(), VALID_LONG_SECRET);
    assert.equal(SESSION_JWT.algorithm, "HS256");
    assert.deepEqual(SESSION_JWT.algorithms, ["HS256"]);
    assert.equal(SESSION_JWT.issuer, "visitantes-dimebras");
    assert.equal(SESSION_JWT.audience, "visitantes-dimebras-frontend");
    assert.equal(SESSION_JWT.expiresIn, "8h");
  });
});
