export const SESSION_JWT = Object.freeze({
  algorithm: "HS256",
  algorithms: ["HS256"],
  issuer: "visitantes-dimebras",
  audience: "visitantes-dimebras-frontend",
  expiresIn: "8h",
});

export function getJwtSecret() {
  return process.env.JWT_SECRET;
}

export function validateJwtSecret() {
  const secret = getJwtSecret();

  if (typeof secret !== "string" || secret.trim().length === 0) {
    throw new Error("JWT_SECRET must be configured with a non-empty value.");
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
