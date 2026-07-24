import { API_BASE_URL } from "../services/api";

export const TV_MAX_FILE_SIZE = 200 * 1024 * 1024;
export const TV_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm";
export const TV_ALLOWED_MIMES = new Set(TV_ACCEPT.split(","));

export function initialTvContentForm() {
  return {
    title: "",
    file: null,
    order: "0",
    isActive: true,
    selectedBranchIds: [],
  };
}

export function editFormFromTvContent(item) {
  return {
    id: item.id,
    title: item.title || "",
    order: String(item.order ?? 0),
    isActive: Boolean(item.isActive),
    branchIds: branchIdsFromItem(item),
  };
}

export function mediaUrl(fileUrl) {
  if (!fileUrl) return "";
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${API_BASE_URL}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatTvContentDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export function uploadErrorMessage(err, fallback) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return "Arquivo excede o limite de 200MB.";
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return "Formato de arquivo nÃ£o permitido.";
  return err?.response?.data?.message || fallback;
}

export function branchIdsFromItem(item) {
  return Array.isArray(item?.branches) ? item.branches.map((branch) => Number(branch.id)) : [];
}

export function sameBranchSet(selectedIds, branches) {
  if (!Array.isArray(branches) || branches.length === 0) return false;
  const selected = new Set(selectedIds.map((id) => Number(id)));
  return branches.every((branch) => selected.has(Number(branch.id)));
}

export function validateCreateTvContentForm(form) {
  const cleanTitle = form.title.trim();
  const file = singleTvContentFile(form.file);

  if (!cleanTitle) return "Informe o tÃ­tulo da midia.";
  if (!file) return "Selecione um arquivo.";
  if (!TV_ALLOWED_MIMES.has(file.type)) return "Use JPG, PNG, WEBP, MP4 ou WEBM.";
  if (file.size > TV_MAX_FILE_SIZE) return "Arquivo excede o limite de 200MB.";
  if (form.selectedBranchIds.length === 0) return "Selecione pelo menos uma filial.";

  return "";
}

export function validateEditTvContentForm(form) {
  const cleanTitle = form.title.trim();

  if (!cleanTitle) return "Tí­tulo não pode ficar vazio.";
  if (form.branchIds.length === 0) return "Selecione pelo menos uma filial.";

  return "";
}

export function buildCreateTvContentFormData(form) {
  const file = singleTvContentFile(form.file);
  const formData = new FormData();
  formData.append("title", form.title.trim());
  formData.append("order", String(Number(form.order || 0)));
  formData.append("isActive", String(form.isActive));
  formData.append("branchIds", JSON.stringify(form.selectedBranchIds));
  formData.set("file", file);
  return formData;
}

function singleTvContentFile(value) {
  if (typeof File !== "undefined" && value instanceof File) return value;
  if (typeof FileList !== "undefined" && value instanceof FileList) return value[0] || null;
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function buildEditTvContentPayload(form) {
  return {
    title: form.title.trim(),
    order: Number(form.order || 0),
    isActive: form.isActive,
    branchIds: form.branchIds,
  };
}

export function deleteConfirmationForTvContent(item) {
  return {
    title: "Excluir conteúdo",
    message: `Deseja excluir "${item.title}"? O arquivo físico também será removido quando possível.`,
    confirmText: "Excluir",
    cancelText: "Cancelar",
    type: "danger",
  };
}

export function tvContentTypeLabel(type) {
  return type === "IMAGE" ? "Imagem" : "Video";
}
