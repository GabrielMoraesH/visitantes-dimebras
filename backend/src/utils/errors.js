export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details ?? null;
    this.isOperational = true;
  }
}

export function appError(message, statusCode, code, details = null) {
  return new AppError(message, statusCode, code, details);
}

export const badRequest = (message, code = "BAD_REQUEST", details = null) =>
  appError(message, 400, code, details);
export const unauthorized = (message, code = "UNAUTHORIZED", details = null) =>
  appError(message, 401, code, details);
export const forbidden = (message = "Acesso negado", code = "FORBIDDEN", details = null) =>
  appError(message, 403, code, details);
export const notFound = (message, code = "RESOURCE_NOT_FOUND", details = null) =>
  appError(message, 404, code, details);
export const conflict = (message, code = "CONFLICT", details = null) =>
  appError(message, 409, code, details);
export const payloadTooLarge = (message, code = "PAYLOAD_TOO_LARGE", details = null) =>
  appError(message, 413, code, details);
export const unsupportedMediaType = (message, code = "UNSUPPORTED_MEDIA_TYPE", details = null) =>
  appError(message, 415, code, details);
export const serviceUnavailable = (message, code = "SERVICE_UNAVAILABLE", details = null) =>
  appError(message, 503, code, details);

const MESSAGE_CODE_MAP = new Map([
  ["Token ausente", "AUTH_REQUIRED"],
  ["Token inválido", "INVALID_TOKEN"],
  ["Token inválido ou expirado", "INVALID_TOKEN"],
  ["Usuário não autorizado", "USER_INACTIVE"],
  ["Acesso negado", "FORBIDDEN"],
  ["Usuário ou senha inválidos", "INVALID_CREDENTIALS"],
  ["CPF já cadastrado", "VISITOR_CPF_CONFLICT"],
  ["Username já existe", "USER_USERNAME_CONFLICT"],
  ["Usuário já existe", "USER_USERNAME_CONFLICT"],
  ["Visitante não encontrado", "VISITOR_NOT_FOUND"],
  ["Visitante não encontrado", "VISITOR_NOT_FOUND"],
  ["Visitante não encontrado.", "VISITOR_NOT_FOUND"],
  ["Visita não encontrada", "VISIT_NOT_FOUND"],
  ["Visita não encontrada", "VISIT_NOT_FOUND"],
  ["Nenhuma visita em aberto", "OPEN_VISIT_NOT_FOUND"],
  ["Visita em aberto não encontrada.", "OPEN_VISIT_NOT_FOUND"],
  ["Visitante já possui visita em andamento.", "VISITOR_OPEN_VISIT_CONFLICT"],
  ["Cadastro expirado. Atualização obrigatória.", "VISITOR_REGISTRATION_EXPIRED"],
  ["Conteúdo não encontrado", "TV_CONTENT_NOT_FOUND"],
  ["Agendamento não encontrado.", "AGENDA_EVENT_NOT_FOUND"],
  ["Arquivo excede o limite permitido.", "UPLOAD_FILE_TOO_LARGE"],
  ["Arquivo excede o limite de 200MB.", "UPLOAD_FILE_TOO_LARGE"],
  ["Tipo de arquivo não permitido.", "UPLOAD_INVALID_TYPE"],
  ["Extensao de arquivo não permitida.", "UPLOAD_INVALID_TYPE"],
  ["Conteúdo do arquivo não permitido.", "UPLOAD_INVALID_TYPE"],
  ["Arquivo incompativel com o tipo informado.", "UPLOAD_INVALID_TYPE"],
]);

export function inferErrorCode(message, statusCode = 500) {
  if (MESSAGE_CODE_MAP.has(message)) return MESSAGE_CODE_MAP.get(message);
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "RESOURCE_NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 413) return "PAYLOAD_TOO_LARGE";
  if (statusCode === 415) return "UNSUPPORTED_MEDIA_TYPE";
  if (statusCode === 503) return "SERVICE_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

export function toErrorPayload({ message, code, details, statusCode }) {
  return {
    message,
    code: code || inferErrorCode(message, statusCode),
    details: details ?? null,
  };
}
