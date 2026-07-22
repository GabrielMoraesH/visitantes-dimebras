import multer from "multer";
import {
  validateDeclaredFile,
  VISITOR_FILE_LIMIT_BYTES,
  VISITOR_IMAGE_MIMES,
} from "./fileSecurity.js";
import { toErrorPayload } from "./errors.js";

const storage = multer.memoryStorage();
const allowedFields = ["photo", "documentFront", "documentBack"];
const fieldLabels = {
  photo: "foto",
  documentFront: "documento da frente",
  documentBack: "documento do verso",
};

function uploadError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function sendUploadError(res, statusCode, message, code) {
  return res.status(statusCode).json(toErrorPayload({ message, code, statusCode }));
}

export const upload = multer({
  storage,
  limits: {
    fileSize: VISITOR_FILE_LIMIT_BYTES,
    files: 3,
    fields: 0,
    parts: 4,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedFields.includes(file.fieldname)) {
      return cb(uploadError("Campo de arquivo inválido.", 400), false);
    }

    const declared = validateDeclaredFile(file, VISITOR_IMAGE_MIMES);
    if (!declared.ok) {
      return cb(uploadError(declared.message, declared.statusCode), false);
    }

    return cb(null, true);
  },
});

export function handleVisitorUploadErrors(req, res, next) {
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "documentFront", maxCount: 1 },
    { name: "documentBack", maxCount: 1 },
  ])(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendUploadError(res, 413, "Arquivo excede o limite permitido.", "UPLOAD_FILE_TOO_LARGE");
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return sendUploadError(res, 400, "O limite máximo é de três arquivos, um por campo.", "UPLOAD_TOO_MANY_FILES");
      }
      if (err.code === "LIMIT_PART_COUNT") {
        return sendUploadError(res, 400, "O limite máximo é de três arquivos, um por campo.", "UPLOAD_TOO_MANY_FILES");
      }
      if (err.code === "LIMIT_FIELD_COUNT") {
        return sendUploadError(res, 400, "Campos de texto não são aceitos neste upload.", "UPLOAD_TEXT_FIELDS_NOT_ALLOWED");
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

        return sendUploadError(res, 400, "Campo de arquivo não reconhecido.", "UPLOAD_UNEXPECTED_FIELD");
      }
      return sendUploadError(res, 400, "Upload inválido.", "UPLOAD_INVALID");
    }

    return sendUploadError(
      res,
      err.statusCode || 400,
      err.message || "Upload inválido.",
      err.code
    );
  });
}
