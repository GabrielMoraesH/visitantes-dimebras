import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultUploadRoot = path.resolve(__dirname, "../../uploads");

export const uploadRoot = path.resolve(process.env.UPLOAD_ROOT || defaultUploadRoot);
export const tvUploadDir = path.join(uploadRoot, "tv");
export const tvTempUploadDir = path.join(uploadRoot, "tmp", "tv");
export const tvPublicPrefix = "/uploads/tv";

fs.mkdirSync(tvUploadDir, { recursive: true });
fs.mkdirSync(tvTempUploadDir, { recursive: true });
