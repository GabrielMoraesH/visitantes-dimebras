import { useCallback, useEffect, useState } from "react";
import { getBranches } from "../services/branchService";
import { getUsers } from "../services/userService";
import { getAuditLogs } from "../services/auditLogsService";
import { auditLoadErrorMessage } from "../utils/auditLogs";

export const INITIAL_AUDIT_FILTERS = {
  from: "",
  to: "",
  action: "",
  entity: "",
  userId: "",
  branchId: "",
  entityId: "",
  requestId: "",
};

function normalizeList(data) {
  return Array.isArray(data) ? data : [];
}

export function useAuditLogs({ enabled = true } = {}) {
  const [draftFilters, setDraftFilters] = useState(INITIAL_AUDIT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_AUDIT_FILTERS);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLists = useCallback(async () => {
    const [usersResult, branchesResult] = await Promise.allSettled([getUsers(), getBranches()]);

    if (usersResult.status === "fulfilled") {
      setUsers(normalizeList(usersResult.value?.data));
    }

    if (branchesResult.status === "fulfilled") {
      setBranches(normalizeList(branchesResult.value?.data));
    }
  }, []);

  const loadAuditLogs = useCallback(
    async (nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) => {
      setLoading(true);
      setError("");

      try {
        const { data } = await getAuditLogs(nextFilters, nextPage, nextPageSize);
        const pagination = data?.pagination || {};
        const resolvedPage = Number(pagination.page || nextPage);
        const resolvedPageSize = Number(pagination.pageSize || nextPageSize);
        const resolvedTotal = Number(pagination.total || 0);
        const resolvedTotalPages = Number(pagination.totalPages || 0);

        setItems(normalizeList(data?.items));
        setPage(resolvedPage);
        setPageSize(resolvedPageSize);
        setTotal(resolvedTotal);
        setTotalPages(resolvedTotalPages);

        if (resolvedTotalPages > 0 && resolvedPage > resolvedTotalPages) {
          setPage(resolvedTotalPages);
        }
      } catch (err) {
        setError(auditLoadErrorMessage(err));
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [appliedFilters, page, pageSize]
  );

  function setFilter(name, value) {
    setDraftFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function applyFilters() {
    setPage(1);
    setAppliedFilters(draftFilters);
  }

  function clearFilters() {
    setDraftFilters(INITIAL_AUDIT_FILTERS);
    setAppliedFilters(INITIAL_AUDIT_FILTERS);
    setPage(1);
    setPageSize(50);
  }

  function changePageSize(value) {
    setPageSize(Number(value));
    setPage(1);
  }

  useEffect(() => {
    if (!enabled) return;
    loadLists();
  }, [enabled, loadLists]);

  useEffect(() => {
    if (!enabled) return;
    loadAuditLogs(page, pageSize, appliedFilters);
  }, [enabled, page, pageSize, appliedFilters, loadAuditLogs]);

  return {
    appliedFilters,
    branches,
    draftFilters,
    error,
    initialLoading,
    items,
    loading,
    page,
    pageSize,
    total,
    totalPages,
    users,
    applyFilters,
    changePageSize,
    clearFilters,
    loadAuditLogs,
    setFilter,
    setPage,
  };
}
