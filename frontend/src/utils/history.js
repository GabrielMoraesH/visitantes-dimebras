export function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

export function formatHistoryDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
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
