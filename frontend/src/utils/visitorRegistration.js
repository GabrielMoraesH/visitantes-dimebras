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

export const VISITOR_REGISTRATION_MESSAGES = {
  alertTitle: "Corrija os campos:",
  cameraCaptureError: "Não foi possível capturar a imagem. Tente novamente.",
  companyInvalid: "Digite o nome da empresa com pelo menos 2 caracteres.",
  companyRequired: "Informe a empresa.",
  cpfConflictCheckin: "CPF já cadastrado. Abrindo o check-in do visitante.",
  cpfConflictUpdatingFiles: "CPF já cadastrado. Atualizando os documentos do visitante.",
  cpfInvalid: "Digite um CPF válido.",
  cpfRequired: "Informe o CPF.",
  docBackRequired: "Fotografe o verso do documento.",
  docFrontRequired: "Fotografe a frente do documento.",
  imageInvalid: "Não foi possível usar esta imagem. Capture-a novamente.",
  imageTooLarge: "A imagem excede o tamanho permitido. Capture outra imagem.",
  imageUnsupported: "Formato de imagem não permitido. Capture a imagem novamente.",
  nameInvalid: "Digite o nome completo com pelo menos 3 caracteres.",
  nameRequired: "Informe o nome completo.",
  networkComplement: "Verifique sua conexão e tente novamente.",
  networkError: "Não foi possível conectar ao servidor.",
  photoRequired: "Fotografe o visitante.",
  phoneInvalid: "Digite um telefone com DDD.",
  phoneRequired: "Informe o telefone.",
  saveError: "Não foi possível concluir o cadastro.",
  saveErrorComplement: "Tente novamente em alguns instantes.",
  saving: "Salvando...",
  savingStatus: "Salvando cadastro, aguarde...",
  success: "Visitante cadastrado com sucesso.",
  verifyCpfError: "Não foi possível verificar o CPF.",
  verifyingCpf: "Verificando CPF...",
  forbiddenBranch: "Você não tem permissão para cadastrar visitantes nesta filial.",
};

const FIELD_LABELS = {
  company: "company",
  "body.company": "company",
  cpf: "cpf",
  "body.cpf": "cpf",
  documentBack: "docBack",
  documentFront: "docFront",
  name: "name",
  "body.name": "name",
  phone: "phone",
  "body.phone": "phone",
  photo: "photo",
};

function fieldError(field, value, ok) {
  if (ok) return "";

  const text = typeof value === "string" ? value.trim() : "";

  if (field === "cpf") return onlyDigits(text) ? VISITOR_REGISTRATION_MESSAGES.cpfInvalid : VISITOR_REGISTRATION_MESSAGES.cpfRequired;
  if (field === "name") return text ? VISITOR_REGISTRATION_MESSAGES.nameInvalid : VISITOR_REGISTRATION_MESSAGES.nameRequired;
  if (field === "phone") return onlyDigits(text) ? VISITOR_REGISTRATION_MESSAGES.phoneInvalid : VISITOR_REGISTRATION_MESSAGES.phoneRequired;
  if (field === "company") return text ? VISITOR_REGISTRATION_MESSAGES.companyInvalid : VISITOR_REGISTRATION_MESSAGES.companyRequired;
  if (field === "photo") return VISITOR_REGISTRATION_MESSAGES.photoRequired;
  if (field === "docFront") return VISITOR_REGISTRATION_MESSAGES.docFrontRequired;
  if (field === "docBack") return VISITOR_REGISTRATION_MESSAGES.docBackRequired;
  return "";
}

export function getVisitorRegistrationErrors(validation) {
  const errors = [
    { field: "cpf", message: fieldError("cpf", validation.cpfDigits, validation.cpfOk) },
    { field: "name", message: fieldError("name", validation.name, validation.nameOk) },
    { field: "phone", message: fieldError("phone", validation.phoneDisplay, validation.phoneOk) },
    { field: "company", message: fieldError("company", validation.company, validation.companyOk) },
    { field: "photo", message: fieldError("photo", null, validation.photoOk) },
    { field: "docFront", message: fieldError("docFront", null, validation.docFrontOk) },
    { field: "docBack", message: fieldError("docBack", null, validation.docBackOk) },
  ].filter((error) => error.message);

  return errors.filter((error, index, current) => current.findIndex((item) => item.message === error.message) === index);
}

export function getFirstVisitorRegistrationError(validation) {
  return getVisitorRegistrationErrors(validation)[0]?.message || "";
}

function fieldMessageFromServerDetail(detail) {
  const field = FIELD_LABELS[detail?.field] || FIELD_LABELS[String(detail?.field || "").replace(/^files\./, "")];
  if (!field) return "";

  if (field === "cpf") return VISITOR_REGISTRATION_MESSAGES.cpfInvalid;
  if (field === "name") return VISITOR_REGISTRATION_MESSAGES.nameInvalid;
  if (field === "phone") return VISITOR_REGISTRATION_MESSAGES.phoneInvalid;
  if (field === "company") return VISITOR_REGISTRATION_MESSAGES.companyInvalid;
  if (field === "photo") return VISITOR_REGISTRATION_MESSAGES.photoRequired;
  if (field === "docFront") return VISITOR_REGISTRATION_MESSAGES.docFrontRequired;
  if (field === "docBack") return VISITOR_REGISTRATION_MESSAGES.docBackRequired;
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

export function buildVisitorWithFilesFormData({ company, cpfDigits, docBack, docFront, name, phoneDisplay, photo }) {
  const payload = buildVisitorRegistrationPayload({ company, cpfDigits, name, phoneDisplay });
  const fd = new FormData();
  fd.set("name", payload.name);
  fd.set("cpf", payload.cpf);
  fd.set("phone", payload.phone);
  fd.set("company", payload.company);
  fd.set("photo", photo);
  fd.set("documentFront", docFront);
  fd.set("documentBack", docBack);
  return fd;
}

export function uploadVisitorRegistrationErrorMessage(err) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  const details = err?.response?.data?.details;

  if (!err?.response) {
    return `${VISITOR_REGISTRATION_MESSAGES.networkError} ${VISITOR_REGISTRATION_MESSAGES.networkComplement}`;
  }

  if (status === 401) return "";

  if (status === 400 && Array.isArray(details)) {
    const messages = details.map(fieldMessageFromServerDetail).filter(Boolean);
    const uniqueMessages = [...new Set(messages)];
    if (uniqueMessages.length > 0) return uniqueMessages.join(" ");
  }

  if (status === 403) return VISITOR_REGISTRATION_MESSAGES.forbiddenBranch;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return VISITOR_REGISTRATION_MESSAGES.imageTooLarge;
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return VISITOR_REGISTRATION_MESSAGES.imageUnsupported;
  if (status === 500) {
    return `${VISITOR_REGISTRATION_MESSAGES.saveError} ${VISITOR_REGISTRATION_MESSAGES.saveErrorComplement}`;
  }

  return `${VISITOR_REGISTRATION_MESSAGES.saveError} ${VISITOR_REGISTRATION_MESSAGES.saveErrorComplement}`;
}
