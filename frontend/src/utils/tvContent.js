import { API_BASE_URL } from "../services/api";

export const TV_MAX_FILE_SIZE = 200 * 1024 * 1024;
export const TV_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm";
export const TV_ALLOWED_MIMES = new Set(TV_ACCEPT.split(","));

export const TV_CONTENT_MESSAGES = {
  createSuccess: "Conteúdo criado com sucesso.",
  updateSuccess: "Conteúdo atualizado com sucesso.",
  activateSuccess: "Conteúdo ativado com sucesso.",
  deactivateSuccess: "Conteúdo desativado com sucesso.",
  deleteSuccess: "Conteúdo excluído com sucesso.",
  loadError: "Não foi possível carregar os conteúdos da TV.",
  loadRetry: "Tente novamente.",
  networkError: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
  unexpectedCreateError: "Não foi possível criar o conteúdo. Tente novamente em alguns instantes.",
  unexpectedUpdateError: "Não foi possível atualizar o conteúdo. Tente novamente em alguns instantes.",
  unexpectedActivateError: "Não foi possível ativar o conteúdo. Tente novamente em alguns instantes.",
  unexpectedDeactivateError: "Não foi possível desativar o conteúdo. Tente novamente em alguns instantes.",
  unexpectedDeleteError: "Não foi possível excluir o conteúdo. Tente novamente em alguns instantes.",
  unexpectedOperationError:
    "Não foi possível concluir a operação. Tente novamente em alguns instantes.",
  forbidden: "Você não tem permissão para alterar os conteúdos da TV.",
  notFound: "Este conteúdo não foi encontrado.",
  fileTooLarge: "A mídia excede o tamanho permitido. Selecione outro arquivo.",
  invalidFormat:
    "Formato de arquivo não permitido. Envie uma imagem ou um vídeo compatível.",
  incompatibleType: "O tipo do arquivo não corresponde à mídia selecionada.",
  invalidMedia: "Não foi possível utilizar esta mídia. Selecione outro arquivo.",
};

export const TV_CONTENT_VALIDATION_MESSAGES = {
  titleRequired: "Informe o título da mídia.",
  titleInvalid: "Digite um título válido.",
  mediaRequired: "Selecione uma imagem ou um vídeo.",
  branchRequired: "Selecione pelo menos uma filial.",
  orderInvalid: "Informe uma ordem válida.",
  invalidFormat: "Formato de arquivo não permitido.",
  fileTooLarge: "A mídia excede o tamanho permitido.",
};

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
  return formatTvContentDateTime(value).full;
}

export function formatTvContentTitle(title, maxLength = 20) {
  if (typeof title !== "string") return "";
  if (title.length <= maxLength) return title;

  return `${title.slice(0, maxLength)}...`;
}

export function formatTvContentDateTime(value) {
  const fallback = { date: "-", time: "", full: "-" };
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const dateText = date.toLocaleDateString("pt-BR");
  const timeText = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const fullTimeText = date.toLocaleTimeString("pt-BR");

  return {
    date: dateText,
    time: timeText,
    full: `${dateText} ${fullTimeText}`,
  };
}

export function uploadErrorMessage(err, fallback) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (!err?.response) return TV_CONTENT_MESSAGES.networkError;
  if (status === 403) return TV_CONTENT_MESSAGES.forbidden;
  if (status === 404) return TV_CONTENT_MESSAGES.notFound;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return TV_CONTENT_MESSAGES.fileTooLarge;
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return TV_CONTENT_MESSAGES.invalidFormat;
  if (code === "UPLOAD_INCOMPATIBLE_TYPE") return TV_CONTENT_MESSAGES.incompatibleType;
  if (code === "UPLOAD_INVALID_FILE") return TV_CONTENT_MESSAGES.invalidMedia;
  if (status >= 500) return TV_CONTENT_MESSAGES.unexpectedOperationError;
  return fallback;
}

export function tvContentActionErrorMessage(err, fallback) {
  const status = err?.response?.status;
  if (!err?.response) return TV_CONTENT_MESSAGES.networkError;
  if (status === 403) return TV_CONTENT_MESSAGES.forbidden;
  if (status === 404) return TV_CONTENT_MESSAGES.notFound;
  if (status >= 500) return TV_CONTENT_MESSAGES.unexpectedOperationError;
  return fallback;
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
  return validateCreateTvContentFields(form)[0]?.message || "";
}

export function validateCreateTvContentFields(form) {
  const cleanTitle = form.title.trim();
  const file = singleTvContentFile(form.file);
  const errors = [];

  if (!cleanTitle) errors.push({ field: "title", message: TV_CONTENT_VALIDATION_MESSAGES.titleRequired });
  if (!file) {
    errors.push({ field: "file", message: TV_CONTENT_VALIDATION_MESSAGES.mediaRequired });
  } else {
    if (!TV_ALLOWED_MIMES.has(file.type)) {
      errors.push({ field: "file", message: TV_CONTENT_VALIDATION_MESSAGES.invalidFormat });
    }
    if (file.size > TV_MAX_FILE_SIZE) {
      errors.push({ field: "file", message: TV_CONTENT_VALIDATION_MESSAGES.fileTooLarge });
    }
  }
  if (form.selectedBranchIds.length === 0) {
    errors.push({ field: "branches", message: TV_CONTENT_VALIDATION_MESSAGES.branchRequired });
  }

  return errors;
}

export function validateEditTvContentForm(form) {
  return validateEditTvContentFields(form)[0]?.message || "";
}

export function validateEditTvContentFields(form) {
  const cleanTitle = form.title.trim();
  const errors = [];

  if (!cleanTitle) errors.push({ field: "title", message: TV_CONTENT_VALIDATION_MESSAGES.titleRequired });
  if (form.branchIds.length === 0) {
    errors.push({ field: "branches", message: TV_CONTENT_VALIDATION_MESSAGES.branchRequired });
  }

  return errors;
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

export function deleteConfirmationForTvContent() {
  return {
    title: "Excluir conteúdo",
    message: "Tem certeza de que deseja excluir este conteúdo? Esta ação não poderá ser desfeita.",
    confirmText: "Excluir conteúdo",
    cancelText: "Cancelar",
    type: "danger",
  };
}

export function tvContentTypeLabel(type) {
  return type === "IMAGE" ? "Imagem" : "Vídeo";
}
