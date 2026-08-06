export const PAST_AGENDA_MESSAGE =
  "Não é possível agendar um evento no passado.";

export const AGENDA_MODAL_MESSAGES = {
  alertTitle: "Corrija os campos:",
  createError: "Não foi possível criar o agendamento.",
  createLoading: "Criando agendamento...",
  createLoadingAccessible: "Criando agendamento, aguarde...",
  createSuccess: "Agendamento criado com sucesso.",
  dateTimeInvalid: "Informe uma data e um horário válidos.",
  dateTimeRequired: "Informe a data e o horário do agendamento.",
  editError: "Não foi possível atualizar o agendamento.",
  editLoading: "Salvando alterações...",
  editLoadingAccessible: "Salvando alterações, aguarde...",
  editSuccess: "Agendamento atualizado com sucesso.",
  networkError: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
  retryLater: "Tente novamente em alguns instantes.",
  requiredCompany: "Informe a empresa.",
  requiredDepartment: "Informe o setor.",
  requiredEventWith: "Informe com quem o visitante veio falar.",
  requiredVisitorName: "Informe o nome do visitante.",
};

export const FIELD_ERROR_IDS = {
  visitorName: "agenda-visitorName-error",
  company: "agenda-company-error",
  eventWith: "agenda-eventWith-error",
  department: "agenda-department-error",
  date: "agenda-date-error",
  time: "agenda-time-error",
};

const VALIDATION_ORDER = [
  "visitorName",
  "company",
  "eventWith",
  "department",
  "dateTime",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function required(value) {
  return !String(value || "").trim();
}

export function buildAgendaValidationErrors(form) {
  const errors = {};

  if (required(form.visitorName)) {
    errors.visitorName = AGENDA_MODAL_MESSAGES.requiredVisitorName;
  }

  if (required(form.company)) {
    errors.company = AGENDA_MODAL_MESSAGES.requiredCompany;
  }

  if (required(form.eventWith)) {
    errors.eventWith = AGENDA_MODAL_MESSAGES.requiredEventWith;
  }

  if (required(form.department)) {
    errors.department = AGENDA_MODAL_MESSAGES.requiredDepartment;
  }

  if (required(form.date) || required(form.time)) {
    errors.dateTime = AGENDA_MODAL_MESSAGES.dateTimeRequired;
    return errors;
  }

  if (!DATE_PATTERN.test(form.date) || !TIME_PATTERN.test(form.time)) {
    errors.dateTime = AGENDA_MODAL_MESSAGES.dateTimeInvalid;
    return errors;
  }

  const selectedDateTime = new Date(`${form.date}T${form.time}:00`);

  if (Number.isNaN(selectedDateTime.getTime())) {
    errors.dateTime = AGENDA_MODAL_MESSAGES.dateTimeInvalid;
    return errors;
  }

  if (selectedDateTime < new Date()) {
    errors.dateTime = PAST_AGENDA_MESSAGE;
  }

  return errors;
}

export function orderedAgendaValidationMessages(errors) {
  return VALIDATION_ORDER.map((field) => errors[field]).filter(Boolean);
}

export function agendaOperationErrorMessage(err, isEdit) {
  if (!err?.response) return AGENDA_MODAL_MESSAGES.networkError;

  if (err.response.status === 403) {
    return "Você não tem permissão para alterar agendamentos desta filial.";
  }

  const apiMessage = String(err.response.data?.message || "");
  if (/branchId|filial|branch/i.test(apiMessage) && err.response.status === 400) {
    return "A filial selecionada não está disponível.";
  }

  const actionMessage = isEdit
    ? AGENDA_MODAL_MESSAGES.editError
    : AGENDA_MODAL_MESSAGES.createError;

  return `${actionMessage} ${AGENDA_MODAL_MESSAGES.retryLater}`;
}
