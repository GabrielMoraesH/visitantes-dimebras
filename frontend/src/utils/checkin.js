export function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

export function formatCPF(value) {
  if (!value) return "";
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function isValidCPF(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (base) => {
    let factor = base.length + 1;
    const total = base.split("").reduce((sum, digit) => sum + Number(digit) * factor--, 0);
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calculateDigit(cpf.slice(0, 9)) === Number(cpf[9]) && calculateDigit(cpf.slice(0, 10)) === Number(cpf[10]);
}

export function formatPhone(value) {
  if (!value) return "";
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function isOlderThan6Months(dateValue) {
  if (!dateValue) return true;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return true;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return date < sixMonthsAgo;
}

export function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

const TECHNICAL_TERMS = /\b(token|jwt|qr|request|stack|documentFront|documentBack|photo|mime|buffer)\b/i;

export function networkErrorMessage() {
  return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
}

export function unexpectedLabelErrorMessage() {
  return "Não foi possível gerar a etiqueta. Tente novamente em alguns instantes.";
}

export function uploadErrorMessage(err, fallback) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return "Imagem excede o limite permitido.";
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return "Não foi possível utilizar esta imagem. Capture outra.";
  if (!err?.response) return networkErrorMessage();
  return fallback;
}

export function uniqueFieldErrorMessages(fieldErrors) {
  return [...new Set((fieldErrors || []).map((item) => item?.message).filter(Boolean))];
}

export function visitorDocumentPendencies(visitor) {
  if (!visitor) return [];

  const items = [];
  const frontUpdatedAt = visitor.documentFrontUpdatedAt;
  const backUpdatedAt = visitor.documentBackUpdatedAt;

  if (!frontUpdatedAt) {
    items.push({
      field: "documentFront",
      kind: "missing",
      message: "Fotografe a frente do documento.",
    });
  } else if (isOlderThan6Months(frontUpdatedAt)) {
    items.push({
      field: "documentFront",
      kind: "expired",
      message: "A frente do documento está expirada. Fotografe-a novamente.",
    });
  }

  if (!backUpdatedAt) {
    items.push({
      field: "documentBack",
      kind: "missing",
      message: "Fotografe o verso do documento.",
    });
  } else if (isOlderThan6Months(backUpdatedAt)) {
    items.push({
      field: "documentBack",
      kind: "expired",
      message: "O verso do documento está expirado. Fotografe-o novamente.",
    });
  }

  return items;
}

export function visitorDocumentStatusMessage(documentPendencies) {
  const items = documentPendencies || [];
  if (items.length === 0) return "";

  if (items.length === 2 && items.every((item) => item.kind === "expired")) {
    return "Os documentos deste visitante estão expirados. Atualize a frente e o verso para continuar.";
  }

  if (items.length === 2 && items.every((item) => item.kind === "missing")) {
    return "Fotografe a frente e o verso do documento para continuar.";
  }

  if (items.length === 2) {
    return "Atualize a frente e o verso do documento para continuar.";
  }

  const [item] = items;
  if (item.field === "documentFront" && item.kind === "expired") {
    return "A frente do documento está expirada. Atualize-a para continuar.";
  }
  if (item.field === "documentBack" && item.kind === "expired") {
    return "O verso do documento está expirado. Atualize-o para continuar.";
  }
  if (item.field === "documentFront") {
    return "Fotografe a frente do documento para continuar.";
  }
  return "Fotografe o verso do documento para continuar.";
}

export function requiredVisitFieldErrors({ attendedBy, serviceType }) {
  const errors = [];

  if (!String(attendedBy || "").trim()) {
    errors.push({ path: "attendedBy", message: "Informe com quem o visitante veio falar." });
  }

  if (!String(serviceType || "").trim()) {
    errors.push({ path: "serviceType", message: "Informe o motivo da visita." });
  }

  return errors;
}

export function cpfSearchErrorMessage(cpf) {
  const digits = onlyDigits(cpf);
  if (!digits) return "Informe o CPF.";
  if (!isValidCPF(digits)) return "Digite um CPF válido.";
  return "";
}

export function visitorNotFoundMessage() {
  return "Nenhum visitante foi encontrado com o CPF informado. Cadastre o visitante para continuar.";
}

export function openVisitConflictMessage({ sameBranch = false } = {}) {
  return sameBranch
    ? "Este visitante já possui uma visita em aberto nesta filial."
    : "Este visitante já possui uma visita em aberto.";
}

export function searchErrorMessage(err) {
  if (!err?.response) return networkErrorMessage();
  return "Não foi possível buscar o visitante. Tente novamente em alguns instantes.";
}

export function visitorSaveErrorMessage(err) {
  if (!err?.response) return networkErrorMessage();
  return "Não foi possível atualizar os dados do visitante. Tente novamente.";
}

export function normalizeCheckinFieldError(item) {
  const rawPath = String(item?.path || item?.field || "").trim();
  const rawMessage = String(item?.message || "").trim();
  const path = rawPath || "visit";
  const normalizedPath = path.toLowerCase();

  if (normalizedPath.includes("cpf")) return { path, message: "Digite um CPF válido." };
  if (normalizedPath.includes("company") || /empresa/i.test(rawMessage)) return { path, message: "Informe a empresa." };
  if (normalizedPath.includes("attendedby")) {
    return { path, message: "Informe com quem o visitante veio falar." };
  }
  if (normalizedPath.includes("servicetype") || /motivo/i.test(rawMessage)) {
    return { path, message: "Informe o motivo da visita." };
  }
  if (normalizedPath.includes("branch") || /filial/i.test(rawMessage)) return { path, message: "Selecione a filial." };
  if (normalizedPath.includes("documentfront")) return { path: "documentFront", message: "Fotografe a frente do documento." };
  if (normalizedPath.includes("documentback")) return { path: "documentBack", message: "Fotografe o verso do documento." };
  if (TECHNICAL_TERMS.test(rawMessage)) return { path, message: unexpectedLabelErrorMessage() };

  return { path, message: rawMessage || "Corrija os dados da visita." };
}

export function normalizeCheckinFieldErrors(details) {
  const order = ["cpf", "visitor", "visit", "attendedBy", "serviceType", "company", "branch", "documentFront", "documentBack"];
  const indexOf = (path) => {
    const lower = String(path || "").toLowerCase();
    const index = order.findIndex((item) => lower.includes(item.toLowerCase()));
    return index === -1 ? order.length : index;
  };

  return (details || []).map(normalizeCheckinFieldError).sort((a, b) => indexOf(a.path) - indexOf(b.path));
}

export function labelGenerationErrorMessage(err) {
  const resp = err?.response?.data;
  const message = String(resp?.message || "");
  if (!err?.response) return networkErrorMessage();
  if (resp?.code === "VISITOR_OPEN_VISIT_CONFLICT" || message.toLowerCase().includes("visita em andamento")) {
    return openVisitConflictMessage({ sameBranch: true });
  }
  return unexpectedLabelErrorMessage();
}

export function buildVisitorImageFile(blob, cpf, suffix) {
  return new File([blob], `${onlyDigits(cpf || "visitante")}-${suffix}.jpg`, {
    type: "image/jpeg",
  });
}
