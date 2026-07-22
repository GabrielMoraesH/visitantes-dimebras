import { useCallback, useEffect, useState } from "react";
import { getBranches } from "../services/branchService";
import { api } from "../services/api";
import {
  buildHistoryParams,
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
  const [msg, setMsg] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
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
    async (nextPage = page, nextLimit = limit) => {
      setMsg("");

      try {
        const params = buildHistoryParams(filters, nextPage, nextLimit);
        const url = `/history?${params.toString()}`;
        const { data } = await api.get(url);

        setItems(normalizeHistoryItems(data));
        setPage(Number(data?.page || nextPage));
        setTotal(Number(data?.total || 0));
        setTotalPages(Number(data?.totalPages || 1));
      } catch (err) {
        setMsg(err?.response?.data?.message || "Erro ao carregar histórico");
      }
    },
    [filters, limit, page]
  );

  const submitFilters = useCallback(() => {
    setPage(1);
    loadHistory(1, limit);
  }, [limit, loadHistory]);

  const changeLimit = useCallback(
    (value) => {
      const nextLimit = Number(value);

      setLimit(nextLimit);
      setPage(1);
      loadHistory(1, nextLimit);
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
    // e filtros só disparam nova busca por submit/alteração de limite/paginação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    branches,
    filters,
    items,
    limit,
    msg,
    page,
    total,
    totalPages,
    changeLimit,
    loadHistory,
    setFilter,
    submitFilters,
  };
}
