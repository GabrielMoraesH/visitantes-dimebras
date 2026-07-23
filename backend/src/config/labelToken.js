const MIN_LABEL_TOKEN_TTL_SECONDS = 300;
const DEFAULT_LABEL_TOKEN_TTL_SECONDS = 8 * 60 * 60;

function labelTokenTtlSeconds() {
  return Math.max(
    MIN_LABEL_TOKEN_TTL_SECONDS,
    Number(process.env.LABEL_TOKEN_TTL_SECONDS || DEFAULT_LABEL_TOKEN_TTL_SECONDS)
  );
}

export const LABEL_TOKEN = Object.freeze({
  algorithm: "HS256",
  algorithms: ["HS256"],
  issuer: process.env.LABEL_TOKEN_ISSUER || "visitantes-dimebras-label",
  audience: process.env.LABEL_TOKEN_AUDIENCE || "visitantes-dimebras-label-print",
});

export function getLabelTokenSecret() {
  // Temporary compatibility fallback: existing deployments only have JWT_SECRET.
  // Prefer LABEL_TOKEN_SECRET in new environments so label tokens and session
  // tokens can be rotated independently.
  return process.env.LABEL_TOKEN_SECRET || process.env.JWT_SECRET;
}

export function labelTokenExpiresInSeconds() {
  return labelTokenTtlSeconds();
}

export function labelTokenSignOptions() {
  return {
    algorithm: LABEL_TOKEN.algorithm,
    expiresIn: labelTokenExpiresInSeconds(),
    issuer: LABEL_TOKEN.issuer,
    audience: LABEL_TOKEN.audience,
  };
}

export function labelTokenVerifyOptions() {
  return {
    algorithms: LABEL_TOKEN.algorithms,
    issuer: LABEL_TOKEN.issuer,
    audience: LABEL_TOKEN.audience,
  };
}
