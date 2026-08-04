import { formatDatePtBr, formatTimePtBr } from "./dateTime";

export const AUDIT_ACTIONS = [
  "LOGIN",
  "VISITOR_CREATE",
  "VISITOR_UPDATE",
  "VISITOR_FILES_UPDATE",
  "CHECKIN",
  "CHECKOUT",
  "TV_CONTENT_CREATE",
  "TV_CONTENT_UPDATE",
  "TV_CONTENT_ACTIVATE",
  "TV_CONTENT_DEACTIVATE",
  "TV_CONTENT_DELETE",
  "AGENDA_EVENT_CREATE",
  "AGENDA_EVENT_UPDATE",
  "AGENDA_EVENT_DEACTIVATE",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_ACTIVATE",
  "USER_DEACTIVATE",
  "VISIT_LABEL_GENERATE",
];

export const AUDIT_ENTITIES = ["AUTH", "VISITOR", "VISIT", "TV_CONTENT", "AGENDA_EVENT", "USER"];

export const AUDIT_PAGE_SIZES = [25, 50, 100];

const ACTION_LABELS = {
  LOGIN: "Login",
  VISITOR_CREATE: "Visitante criado",
  VISITOR_UPDATE: "Visitante atualizado",
  VISITOR_FILES_UPDATE: "Documentos do visitante atualizados",
  CHECKIN: "Check-in",
  CHECKOUT: "Check-out",
  TV_CONTENT_CREATE: "Conteúdo de TV criado",
  TV_CONTENT_UPDATE: "Conteúdo de TV atualizado",
  TV_CONTENT_ACTIVATE: "Conteúdo de TV ativado",
  TV_CONTENT_DEACTIVATE: "Conteúdo de TV desativado",
  TV_CONTENT_DELETE: "Conteúdo de TV excluído",
  AGENDA_EVENT_CREATE: "Evento de agenda criado",
  AGENDA_EVENT_UPDATE: "Evento de agenda atualizado",
  AGENDA_EVENT_DEACTIVATE: "Evento de agenda cancelado",
  USER_CREATE: "Usuário criado",
  USER_UPDATE: "Usuário atualizado",
  USER_ACTIVATE: "Usuário ativado",
  USER_DEACTIVATE: "Usuário desativado",
  VISIT_LABEL_GENERATE: "Etiqueta de visita gerada",
};

const ENTITY_LABELS = {
  AUTH: "Autenticação",
  VISITOR: "Visitante",
  VISIT: "Visita",
  TV_CONTENT: "Conteúdo TV",
  AGENDA_EVENT: "Agenda",
  USER: "Usuário",
};

export function buildAuditLogParams(filters = {}, page = 1, pageSize = 50) {
  const params = {
    page,
    pageSize,
  };

  for (const field of [
    "action",
    "entity",
    "userId",
    "branchId",
    "entityId",
    "from",
    "to",
    "requestId",
  ]) {
    const value = String(filters[field] ?? "").trim();
    if (value) params[field] = value;
  }

  return params;
}

export function formatAuditActionLabel(action) {
  return ACTION_LABELS[action] || action || "-";
}

export function formatAuditEntityLabel(entity) {
  return ENTITY_LABELS[entity] || entity || "-";
}

export function auditActionTone(action) {
  if (
    action === "VISITOR_CREATE" ||
    action === "CHECKIN" ||
    action === "TV_CONTENT_CREATE" ||
    action === "TV_CONTENT_ACTIVATE" ||
    action === "AGENDA_EVENT_CREATE" ||
    action === "USER_CREATE" ||
    action === "USER_ACTIVATE"
  ) {
    return "success";
  }
  if (
    action === "VISITOR_FILES_UPDATE" ||
    action === "VISITOR_UPDATE" ||
    action === "TV_CONTENT_UPDATE" ||
    action === "AGENDA_EVENT_UPDATE" ||
    action === "USER_UPDATE" ||
    action === "VISIT_LABEL_GENERATE"
  ) {
    return "info";
  }
  if (
    action === "TV_CONTENT_DEACTIVATE" ||
    action === "AGENDA_EVENT_DEACTIVATE" ||
    action === "USER_DEACTIVATE"
  ) {
    return "warning";
  }
  if (action === "TV_CONTENT_DELETE") return "danger";
  return "neutral";
}

export function formatAuditDateTime(value) {
  return `${formatDatePtBr(value, "-")} ${formatTimePtBr(value, "")}`.trim();
}

export function auditUserLabel(log) {
  return log?.user?.username || "Usuario removido";
}

export function auditBranchLabel(log) {
  return log?.branch?.name || "Sem filial";
}

export function formatMetadata(metadata) {
  if (metadata == null) return "null";

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}
