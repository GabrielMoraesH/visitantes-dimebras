import { formatCPF, formatPhone, onlyDigits } from "./checkin";

export { formatCPF, formatPhone, onlyDigits };

export function isValidCPF(cpfDigits = "") {
  const cpf = onlyDigits(cpfDigits);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDV = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (base.length + 1 - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const dv1 = calcDV(cpf.slice(0, 9));
  const dv2 = calcDV(cpf.slice(0, 9) + dv1);

  return cpf === cpf.slice(0, 9) + String(dv1) + String(dv2);
}

export function isValidPhone(phoneDigits = "") {
  const phone = onlyDigits(phoneDigits);
  return phone.length === 10 || phone.length === 11;
}

export function makeJpgFile(blob, filenameBase) {
  return new File([blob], `${filenameBase}.jpg`, { type: "image/jpeg" });
}

export function getFirstVisitorRegistrationError(validation) {
  if (!validation.cpfOk) return "CPF inválido.";
  if (!validation.nameOk) return "Nome completo é obrigatório.";
  if (!validation.phoneOk) return "Telefone inválido (mínimo 10 dígitos).";
  if (!validation.companyOk) return "Empresa é obrigatória.";
  if (!validation.photoOk) return "Foto do visitante é obrigatória.";
  if (!validation.docFrontOk) return "Documento (frente) é obrigatório.";
  if (!validation.docBackOk) return "Documento (verso) é obrigatório.";
  return "";
}

export function buildVisitorRegistrationPayload({ name, cpfDigits, phoneDisplay, company }) {
  return {
    name: name.trim(),
    cpf: cpfDigits,
    phone: onlyDigits(phoneDisplay),
    company: company.trim(),
  };
}

export function buildVisitorFilesFormData({ photo, docFront, docBack }) {
  const fd = new FormData();
  fd.set("photo", photo);
  fd.set("documentFront", docFront);
  fd.set("documentBack", docBack);
  return fd;
}

export function uploadVisitorRegistrationErrorMessage(err) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return "Imagem excede o limite permitido.";
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return "Imagem em formato não permitido.";
  const message = err?.response?.data?.message || "Erro ao salvar visitante";
  if (err?.cleanupFailed) {
    return `${message}. O cadastro pode ter ficado incompleto; busque o CPF novamente para continuar.`;
  }
  return message;
}
