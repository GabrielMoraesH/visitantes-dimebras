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

export const AUDIT_MESSAGES = {
  initialLoading: "Carregando auditoria...",
  initialLoadingAccessible: "Carregando registros de auditoria, aguarde...",
  updating: "Atualizando auditoria...",
  loadError: "Não foi possível carregar os registros de auditoria.",
  loadErrorRetry: "Tente novamente.",
  loadErrorLater: "Tente novamente em alguns instantes.",
  networkError: "Não foi possível conectar ao servidor.",
  networkErrorRetry: "Verifique sua conexão e tente novamente.",
  forbidden: "Você não tem permissão para acessar a Auditoria.",
  empty: "Nenhum registro de auditoria foi encontrado.",
  filteredEmpty: "Nenhum registro de auditoria foi encontrado para os filtros informados.",
  retryButton: "Tentar novamente",
  removedUser: "Usuário removido",
  noBranch: "Sem filial",
  emptyValue: "—",
  noMetadata: "Sem metadados",
};

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
  return ENTITY_LABELS[entity] || entity || AUDIT_MESSAGES.emptyValue;
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
  return log?.user?.username || AUDIT_MESSAGES.removedUser;
}

export function auditBranchLabel(log) {
  return log?.branch?.name || AUDIT_MESSAGES.noBranch;
}

export function formatMetadata(metadata) {
  if (metadata == null) return AUDIT_MESSAGES.noMetadata;

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

export function displayAuditValue(value) {
  return String(value ?? "").trim() || AUDIT_MESSAGES.emptyValue;
}

export function hasAuditFilters(filters = {}) {
  return Object.entries(filters).some(([field, value]) => {
    if (field === "pageSize") return false;
    return String(value ?? "").trim() !== "";
  });
}

export function auditLoadErrorMessage(error) {
  if (!error?.response) {
    return `${AUDIT_MESSAGES.networkError} ${AUDIT_MESSAGES.networkErrorRetry}`;
  }

  const status = Number(error.response.status);

  if (status === 403) return AUDIT_MESSAGES.forbidden;
  if (status >= 500) return `${AUDIT_MESSAGES.loadError} ${AUDIT_MESSAGES.loadErrorLater}`;

  return `${AUDIT_MESSAGES.loadError} ${AUDIT_MESSAGES.loadErrorRetry}`;
}
