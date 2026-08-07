import { formatDatePtBr, formatTimePtBr } from "./dateTime";

export const HISTORY_MESSAGES = {
  loading: "Carregando histórico...",
  loadingAccessible: "Carregando histórico, aguarde...",
  loadError: "Não foi possível carregar o histórico.",
  loadErrorRetry: "Tente novamente.",
  loadErrorLater: "Tente novamente em alguns instantes.",
  networkError: "Não foi possível conectar ao servidor.",
  networkErrorComplement: "Verifique sua conexão e tente novamente.",
  forbidden: "Você não tem permissão para consultar este histórico.",
  empty: "Nenhuma visita foi encontrada no histórico.",
  emptyWithFilters: "Nenhuma visita foi encontrada para os filtros informados.",
  retry: "Tentar novamente",
};

export function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

export function formatHistoryDateParts(value) {
  return {
    date: formatDatePtBr(value, "-"),
    time: formatTimePtBr(value, "-"),
  };
}

export function formatHistoryDate(value) {
  const { date, time } = formatHistoryDateParts(value);
  if (date === "-" && time === "-") return "-";
  return `${date} ${time}`;
}

export function buildHistoryParams(filters, page, limit) {
  const params = new URLSearchParams();

  if (filters.cpf) {
    params.set("cpf", onlyDigits(filters.cpf));
  }

  if (filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (filters.branchName !== "all") {
    params.set("branchName", filters.branchName);
  }

  if (filters.date) {
    params.set("date", filters.date);
  }

  params.set("page", String(page));
  params.set("limit", String(limit));

  return params;
}

export function normalizeHistoryItems(data) {
  return Array.isArray(data?.items) ? data.items : [];
}

export function normalizeBranches(data) {
  if (!Array.isArray(data)) return [];

  return data
    .map((branch) => ({
      id: branch?.id,
      name: typeof branch?.name === "string" ? branch.name : "",
    }))
    .filter((branch) => branch.name);
}

export function hasHistoryFilters(filters) {
  return Boolean(
    onlyDigits(filters?.cpf) ||
      (filters?.status && filters.status !== "all") ||
      (filters?.branchName && filters.branchName !== "all") ||
      filters?.date
  );
}

export function historyLoadErrorMessage(err) {
  if (!err?.response) {
    return {
      message: HISTORY_MESSAGES.networkError,
      complement: HISTORY_MESSAGES.networkErrorComplement,
    };
  }

  const status = Number(err.response.status);

  if (status === 403) {
    return {
      message: HISTORY_MESSAGES.forbidden,
      complement: "",
    };
  }

  if (status >= 500) {
    return {
      message: HISTORY_MESSAGES.loadError,
      complement: HISTORY_MESSAGES.loadErrorLater,
    };
  }

  return {
    message: HISTORY_MESSAGES.loadError,
    complement: HISTORY_MESSAGES.loadErrorRetry,
  };
}
