import multer from "multer";
import {
  validateDeclaredFile,
  VISITOR_FILE_LIMIT_BYTES,
  VISITOR_IMAGE_MIMES,
} from "./fileSecurity.js";
import { toErrorPayload } from "./errors.js";

const storage = multer.memoryStorage();
const allowedFields = ["photo", "documentFront", "documentBack"];
const visitorTextFields = ["name", "cpf", "phone", "company"];
const visitorFileFields = [
  { name: "photo", maxCount: 1 },
  { name: "documentFront", maxCount: 1 },
  { name: "documentBack", maxCount: 1 },
];
const visitorWithFilesLogicalPartLimit = 7;
const visitorWithFilesMulterPartLimit = visitorWithFilesLogicalPartLimit + 1;
const fieldLabels = {
  photo: "foto",
  documentFront: "documento da frente",
  documentBack: "documento do verso",
};

function uploadError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.isUploadValidationError = true;
  return err;
}

function sendUploadError(res, statusCode, message, code) {
  return res.status(statusCode).json(toErrorPayload({ message, code, statusCode }));
}

function visitorFileFilter(req, file, cb) {
  if (!allowedFields.includes(file.fieldname)) {
    return cb(uploadError("Campo de arquivo inválido.", 400), false);
  }

  const declared = validateDeclaredFile(file, VISITOR_IMAGE_MIMES);
  if (!declared.ok) {
    return cb(uploadError(declared.message, declared.statusCode), false);
  }

  return cb(null, true);
}

function createVisitorUpload(limits) {
  return multer({
    storage,
    limits: {
      fileSize: VISITOR_FILE_LIMIT_BYTES,
      ...limits,
    },
    fileFilter: visitorFileFilter,
  });
}

export const upload = createVisitorUpload({
  files: 3,
  fields: 0,
  parts: 4,
});

export const visitorWithFilesUpload = createVisitorUpload({
  files: 3,
  fields: 4,
  // Busboy emits partsLimit when the counter reaches this value, before
  // emitting that part. Use 8 so seven valid parts are accepted.
  parts: visitorWithFilesMulterPartLimit,
});

export const visitorUploadConfig = Object.freeze({
  fileFields: allowedFields,
  textFields: visitorTextFields,
  limits: {
    visitorFiles: {
      files: 3,
      fields: 0,
      parts: 4,
      fileSize: VISITOR_FILE_LIMIT_BYTES,
    },
    visitorWithFiles: {
      files: 3,
      fields: 4,
      parts: visitorWithFilesLogicalPartLimit,
      fileSize: VISITOR_FILE_LIMIT_BYTES,
    },
  },
});

function handleMulterError(err, res, messages) {
  if (err.code === "LIMIT_FILE_SIZE") {
    return sendUploadError(res, 413, messages.fileSize, "UPLOAD_FILE_TOO_LARGE");
  }
  if (err.code === "LIMIT_FILE_COUNT") {
    return sendUploadError(res, 400, messages.fileCount, "UPLOAD_TOO_MANY_FILES");
  }
  if (err.code === "LIMIT_FIELD_COUNT") {
    return sendUploadError(res, 400, messages.fieldCount, messages.fieldCountCode);
  }
  if (err.code === "LIMIT_PART_COUNT") {
    return sendUploadError(res, 400, messages.partCount, messages.partCountCode);
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    if (allowedFields.includes(err.field)) {
      return sendUploadError(
        res,
        400,
        `Foi enviado mais de um arquivo para o campo de ${fieldLabels[err.field]}.`,
        "UPLOAD_DUPLICATE_FIELD"
      );
    }

    return sendUploadError(res, 400, messages.unexpectedFile, "UPLOAD_UNEXPECTED_FIELD");
  }
  return sendUploadError(res, 400, "Upload inválido.", "UPLOAD_INVALID");
}

const visitorUploadMessages = {
  fileSize: "Arquivo excede o limite permitido.",
  fileCount: "O limite máximo é de três arquivos, um por campo.",
  fieldCount: "Campos de texto não são aceitos neste upload.",
  fieldCountCode: "UPLOAD_TEXT_FIELDS_NOT_ALLOWED",
  partCount: "O limite máximo é de três arquivos, um por campo.",
  partCountCode: "UPLOAD_TOO_MANY_FILES",
  unexpectedFile: "Campo de arquivo não reconhecido.",
};

const visitorWithFilesUploadMessages = {
  fileSize: "Arquivo excede o limite permitido.",
  fileCount: "Arquivos demais. Envie exatamente photo, documentFront e documentBack.",
  fieldCount: "Campos de texto demais. Envie apenas name, cpf, phone e company.",
  fieldCountCode: "UPLOAD_TOO_MANY_FIELDS",
  partCount: "Partes demais no multipart. Envie apenas quatro campos de texto e tres arquivos.",
  partCountCode: "UPLOAD_TOO_MANY_PARTS",
  unexpectedFile: "Campo de arquivo inesperado. Use apenas photo, documentFront e documentBack.",
};

/*
 * Multer limits the amount of text fields, but upload.fields() does not
 * whitelist text field names. Strict validation of name, cpf, phone and
 * company belongs in the future endpoint controller/schema.
 */
export function handleVisitorWithFilesUpload(req, res, next) {
  visitorWithFilesUpload.fields(visitorFileFields)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      return handleMulterError(err, res, visitorWithFilesUploadMessages);
    }

    if (err.isUploadValidationError) {
      return sendUploadError(
        res,
        err.statusCode || 400,
        err.message || "Upload inválido.",
        err.code
      );
    }

    return next(err);
  });
}

export function handleVisitorUploadErrors(req, res, next) {
  upload.fields(visitorFileFields)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      return handleMulterError(err, res, visitorUploadMessages);
    }

    return sendUploadError(
      res,
      err.statusCode || 400,
      err.message || "Upload inválido.",
      err.code
    );
  });
}
