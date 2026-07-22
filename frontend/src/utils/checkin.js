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

export function buildVisitorImageFile(blob, cpf, suffix) {
  return new File([blob], `${onlyDigits(cpf || "visitante")}-${suffix}.jpg`, {
    type: "image/jpeg",
  });
}
