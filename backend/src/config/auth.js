export const SESSION_JWT = Object.freeze({
  algorithm: "HS256",
  algorithms: ["HS256"],
  issuer: "visitantes-dimebras",
  audience: "visitantes-dimebras-frontend",
  expiresIn: "8h",
});

const MIN_JWT_SECRET_LENGTH = 32;

const BLOCKED_JWT_SECRET_VALUES = new Set([
  "change-me",
  "changeme",
  "secret",
  "jwt-secret",
  "your-secret",
  "your-jwt-secret",
  "change-me-use-a-long-random-secret",
  "replace-with-a-random-secret-of-at-least-32-characters",
  "undefined",
  "null",
]);

export function getJwtSecret() {
  return process.env.JWT_SECRET;
}

export function validateJwtSecret() {
  const secret = getJwtSecret();

  if (typeof secret !== "string" || secret.trim().length === 0) {
    throw new Error("JWT_SECRET must be configured with a non-empty value.");
  }

  const normalizedSecret = secret.trim().toLowerCase();

  if (BLOCKED_JWT_SECRET_VALUES.has(normalizedSecret)) {
    throw new Error("JWT_SECRET must not use a known placeholder or example value.");
  }

  if (normalizedSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error("JWT_SECRET must be at least 32 characters long.");
  }

  if (/^(.)\1+$/.test(normalizedSecret)) {
    throw new Error("JWT_SECRET must not be a trivial repeated-character value.");
  }

  return secret;
}

export function sessionJwtSignOptions(userId) {
  return {
    algorithm: SESSION_JWT.algorithm,
    expiresIn: SESSION_JWT.expiresIn,
    issuer: SESSION_JWT.issuer,
    audience: SESSION_JWT.audience,
    subject: String(userId),
  };
}

export function sessionJwtVerifyOptions() {
  return {
    algorithms: SESSION_JWT.algorithms,
    issuer: SESSION_JWT.issuer,
    audience: SESSION_JWT.audience,
  };
}
