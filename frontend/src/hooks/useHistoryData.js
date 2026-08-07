import { useCallback, useEffect, useState } from "react";
import { getBranches } from "../services/branchService";
import { api } from "../services/api";
import {
  buildHistoryParams,
  hasHistoryFilters,
  historyLoadErrorMessage,
  normalizeBranches,
  normalizeHistoryItems,
} from "../utils/history";

const INITIAL_FILTERS = {
  cpf: "",
  status: "all",
  branchName: "all",
  date: "",
};

export function useHistoryData({ enabled }) {
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focusError, setFocusError] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const setFilter = useCallback((name, value) => {
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }, []);

  const loadHistory = useCallback(
    async (nextPage = page, nextLimit = limit, options = {}) => {
      setError(null);
      setFocusError(false);
      setLoading(true);

      try {
        const params = buildHistoryParams(filters, nextPage, nextLimit);
        const url = `/history?${params.toString()}`;
        const { data } = await api.get(url);

        setItems(normalizeHistoryItems(data));
        setPage(Number(data?.page || nextPage));
        setTotal(Number(data?.total || 0));
        setTotalPages(Math.max(1, Number(data?.totalPages || 1)));
        setAppliedFilters(filters);
      } catch (err) {
        setItems([]);
        setTotal(0);
        setTotalPages(1);
        setError(historyLoadErrorMessage(err));
        setFocusError(Boolean(options.focusOnError));
      } finally {
        setLoading(false);
      }
    },
    [filters, limit, page]
  );

  const submitFilters = useCallback(() => {
    setPage(1);
    loadHistory(1, limit, { focusOnError: true });
  }, [limit, loadHistory]);

  const changeLimit = useCallback(
    (value) => {
      const nextLimit = Number(value);

      setLimit(nextLimit);
      setPage(1);
      loadHistory(1, nextLimit, { focusOnError: true });
    },
    [loadHistory]
  );

  useEffect(() => {
    if (!enabled) return;

    getBranches()
      .then(({ data }) => setBranches(normalizeBranches(data)))
      .catch(() => {
        setBranches([]);
      });
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      loadHistory(1, limit);
    }

    // Preserva o comportamento original: carrega ao entrar na tela,
    // e filtros so disparam nova busca por submit/alteracao de limite/paginacao.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    branches,
    error,
    filters,
    focusError,
    hasAppliedFilters: hasHistoryFilters(appliedFilters),
    items,
    limit,
    loading,
    page,
    total,
    totalPages,
    changeLimit,
    loadHistory,
    setFilter,
    submitFilters,
  };
}
