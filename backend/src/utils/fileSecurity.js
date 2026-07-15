import crypto from "crypto";
import path from "path";

const MIME_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
]);

const EXTENSION_MIMES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

export const VISITOR_FILE_LIMIT_BYTES = 8 * 1024 * 1024;
export const TV_FILE_LIMIT_BYTES = 200 * 1024 * 1024;

export const VISITOR_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const TV_MEDIA_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

function startsWithBytes(buffer, bytes) {
  if (!buffer || buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }

  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", ext: ".png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", ext: ".webp" };
  }

  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return { mime: "video/mp4", ext: ".mp4" };
  }

  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mime: "video/webm", ext: ".webm" };
  }

  return null;
}

export function getSafeExtensionForMime(mime) {
  return MIME_EXTENSIONS.get(mime) || null;
}

export function makeSafeStoredFileName(mime) {
  const ext = getSafeExtensionForMime(mime);
  if (!ext) return null;
  return `${crypto.randomUUID()}${ext}`;
}

export function validateOriginalFileName(originalname = "") {
  const name = String(originalname || "");
  if (!name || name.includes("/") || name.includes("\\") || name.includes("\0")) {
    return false;
  }

  const baseName = path.basename(name);
  if (baseName !== name || baseName === "." || baseName === "..") return false;
  if (baseName.includes("..")) return false;

  const ext = path.extname(baseName);
  const baseWithoutExt = baseName.slice(0, -ext.length);
  if (!ext || baseWithoutExt.includes(".")) return false;

  return true;
}

export function validateDeclaredFile(file, allowedMimes) {
  if (!file || !allowedMimes?.has(file.mimetype)) {
    return { ok: false, statusCode: 415, message: "Tipo de arquivo nao permitido." };
  }

  if (!validateOriginalFileName(file.originalname)) {
    return { ok: false, statusCode: 400, message: "Nome de arquivo invalido." };
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const expectedMime = EXTENSION_MIMES.get(ext);
  if (!expectedMime || expectedMime !== file.mimetype || !allowedMimes.has(expectedMime)) {
    return { ok: false, statusCode: 415, message: "Extensao de arquivo nao permitida." };
  }

  return { ok: true };
}

export function validateMagicBytes(file, allowedMimes) {
  const detected = detectFileType(file?.buffer);

  if (!detected || !allowedMimes.has(detected.mime)) {
    return { ok: false, statusCode: 415, message: "Conteudo do arquivo nao permitido." };
  }

  if (detected.mime !== file.mimetype) {
    return { ok: false, statusCode: 415, message: "Arquivo incompativel com o tipo informado." };
  }

  return { ok: true, detected };
}

export function assertPathInside(rootDir, targetPath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    return null;
  }
  return resolvedTarget;
}
