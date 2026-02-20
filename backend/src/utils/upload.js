import multer from "multer";

const storage = multer.memoryStorage();

function isAllowedImage(mime) {
  return ["image/jpeg", "image/png", "image/webp"].includes(mime);
}

export const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const allowedFields = ["photo", "documentFront", "documentBack"];

    if (!allowedFields.includes(file.fieldname)) {
      return cb(new Error("Campo de arquivo inválido"), false);
    }

    if (!isAllowedImage(file.mimetype)) {
      return cb(new Error("Arquivo deve ser JPG/PNG/WEBP"), false);
    }

    cb(null, true);
  },
});