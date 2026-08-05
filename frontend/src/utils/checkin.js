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

export function uploadErrorMessage(err, fallback) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return "Imagem excede o limite permitido.";
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return "Imagem em formato não permitido.";
  return err?.response?.data?.message || fallback;
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
    errors.push({ path: "attendedBy", message: "Informe com quem veio falar." });
  }

  if (!String(serviceType || "").trim()) {
    errors.push({ path: "serviceType", message: "Informe o que veio fazer na empresa." });
  }

  return errors;
}

export function buildVisitorImageFile(blob, cpf, suffix) {
  return new File([blob], `${onlyDigits(cpf || "visitante")}-${suffix}.jpg`, {
    type: "image/jpeg",
  });
}
