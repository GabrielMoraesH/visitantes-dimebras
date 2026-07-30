export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDatePtBr(value, fallback = "Nao informado") {
  const date = parseDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(date);
}

export function formatTimePtBr(value, fallback = "Nao informado") {
  const date = parseDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(date);
}
