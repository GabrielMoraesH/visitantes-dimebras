import multer from "multer";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {
  AppError,
  appError,
  inferErrorCode,
  serviceUnavailable,
  toErrorPayload,
} from "../utils/errors.js";
import { logError, logWarn } from "../utils/logger.js";

const GENERIC_INTERNAL_MESSAGE = "Erro interno";

function zodDetails(error) {
  return (error?.issues || []).map((issue) => ({
    field: issue.path?.join(".") || "",
    message: issue.message,
  }));
}

function prismaConflictCode(error) {
  const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(",") : "";
  if (target.includes("cpf")) return "VISITOR_CPF_CONFLICT";
  if (target.includes("username")) return "USER_USERNAME_CONFLICT";
  return "UNIQUE_CONSTRAINT_CONFLICT";
}

function translatePrismaError(error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const code = prismaConflictCode(error);
      const message = code === "USER_USERNAME_CONFLICT" ? "Username j\u00e1 existe" : "CPF j\u00e1 cadastrado";
      return appError(message, 409, code);
    }

    if (error.code === "P2025") {
      return appError("Registro n\u00e3o encontrado", 404, "RESOURCE_NOT_FOUND");
    }

    if (error.code === "P2003") {
      return appError("Refer\u00eancia inv\u00e1lida.", 400, "INVALID_REFERENCE");
    }
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return serviceUnavailable("Servi\u00e7o temporariamente indispon\u00edvel.", "DATABASE_UNAVAILABLE");
  }

  return null;
}

export function normalizeErrorResponses(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === "object" && "message" in body) {
      const rawDetails = body.details ?? body.issues ?? null;
      const details = Array.isArray(rawDetails)
        ? rawDetails.map((item) => ({
            field: Array.isArray(item.path) ? item.path.join(".") : item.field || item.path || "",
            message: item.message,
          }))
        : rawDetails;
      return originalJson(
        toErrorPayload({
          message: body.message,
          code: body.code || (res.statusCode === 400 && details ? "VALIDATION_ERROR" : undefined),
          details,
          statusCode: res.statusCode,
        })
      );
    }

    return originalJson(body);
  };

  return next();
}

export function notFoundHandler(req, res, next) {
  next(appError("Rota n\u00e3o encontrada.", 404, "ROUTE_NOT_FOUND"));
}

function translateError(error) {
  if (error instanceof AppError || error?.isOperational) return error;

  if (error instanceof ZodError || error?.name === "ZodError") {
    return appError("Dados inv\u00e1lidos.", 400, "VALIDATION_ERROR", zodDetails(error));
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return appError("Arquivo excede o limite permitido.", 413, "UPLOAD_FILE_TOO_LARGE");
    }
    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_PART_COUNT") {
      return appError("Quantidade de arquivos excedida.", 400, "UPLOAD_TOO_MANY_FILES");
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return appError("Campo de arquivo nao reconhecido.", 400, "UPLOAD_UNEXPECTED_FIELD");
    }
    return appError("Upload invalido.", 400, "UPLOAD_INVALID");
  }

  if (error instanceof jwt.TokenExpiredError || error?.name === "TokenExpiredError") {
    return appError("Token expirado", 401, "TOKEN_EXPIRED");
  }

  if (error instanceof jwt.JsonWebTokenError || error?.name === "JsonWebTokenError") {
    return appError("Token invalido", 401, "INVALID_TOKEN");
  }

  const prismaError = translatePrismaError(error);
  if (prismaError) return prismaError;

  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return appError(
      error.message || "Requisi\u00e7\u00e3o inv\u00e1lida.",
      error.statusCode,
      error.code || inferErrorCode(error.message, error.statusCode),
      error.details
    );
  }

  return appError(GENERIC_INTERNAL_MESSAGE, 500, "INTERNAL_ERROR");
}

function routePath(req) {
  const baseUrl = req.baseUrl || "";
  const route = req.route?.path;

  if (typeof route === "string") return `${baseUrl}${route}` || "/";
  if (route instanceof RegExp) return `${baseUrl}${route.toString()}`;
  return "[unmatched]";
}

function safeLog(error, operationalError, req) {
  const statusCode = operationalError.statusCode || 500;
  const cwdPattern = new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const sensitivePattern =
    /(authorization|bearer\s+[a-z0-9._-]+|password|senha|hash|token|database:\/\/|postgres(?:ql)?:\/\/|select\s+.*\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from)/i;
  const sanitizeLogText = (value) => {
    if (!value) return value;
    const text = String(value).replace(cwdPattern, "[app]");
    if (sensitivePattern.test(text)) return "[redacted]";
    return text;
  };
  const base = {
    requestId: req.requestId,
    method: req.method,
    route: routePath(req),
    status: statusCode,
    code: operationalError.code || "INTERNAL_ERROR",
    errorName: error?.name || operationalError?.name,
    durationMs: req.requestStartedAt
      ? Math.round((performance.now() - req.requestStartedAt) * 100) / 100
      : undefined,
    userId: req.user?.id ?? null,
    branchId: req.user?.branchId ?? null,
  };

  if (statusCode >= 500) {
    logError("api_error", {
      ...base,
      message: sanitizeLogText(error?.message),
      stack: sanitizeLogText(error?.stack),
    });
    return;
  }

  logWarn("api_error", base);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const operationalError = translateError(error);
  safeLog(error, operationalError, req);

  return res.status(operationalError.statusCode || 500).json(
    toErrorPayload({
      message: operationalError.message || GENERIC_INTERNAL_MESSAGE,
      code: operationalError.code,
      details: operationalError.details,
      statusCode: operationalError.statusCode || 500,
    })
  );
}
