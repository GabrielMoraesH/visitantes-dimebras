import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HistoryFilters } from "../components/history/HistoryFilters";
import { HistoryPagination } from "../components/history/HistoryPagination";
import { HistoryTable } from "../components/history/HistoryTable";
import { useHistoryData } from "../hooks/useHistoryData";
import { getUser } from "../services/session";
import { HISTORY_MESSAGES } from "../utils/history";
import "../styles/history.css";

export default function History() {
  const navigate = useNavigate();
  const alertRef = useRef(null);
  const user = useMemo(() => getUser(), []);
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";

  const {
    branches,
    error,
    filters,
    focusError,
    hasAppliedFilters,
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
  } = useHistoryData({ enabled: isAdmin });

  useEffect(() => {
    if (!isAdmin) {
      navigate("/checkin");
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (error && focusError) {
      alertRef.current?.focus();
    }
  }, [error, focusError]);

  function abrirDetalhesDaVisita(visitId) {
    const id = Number(visitId);

    if (!id) return;

    navigate(`/visit/${id}`);
  }

  if (!isAdmin) return null;

  return (
    <div className="history-page">
      <header className="history-topbar">
        <div
          className="history-brand"
          onClick={() => navigate("/checkin")}
          role="button"
          tabIndex={0}
          title="Voltar para Check-in"
        >
          <img src="/logo.png" alt="Dimebras" className="history-logo" />
        </div>

        <div className="history-topbar-actions">
          <button
            className="history-topbar-btn"
            onClick={() => navigate("/checkin")}
            type="button"
          >
            VOLTAR
          </button>
        </div>
      </header>

      <div className="history-container">
        <div className="history-header">
          <div>
            <h2 className="history-title">Histórico</h2>
            <p className="history-subtitle">Check-ins e check-outs registrados</p>
          </div>
        </div>

        <HistoryFilters
          branches={branches}
          filters={filters}
          limit={limit}
          onChangeFilter={setFilter}
          onChangeLimit={changeLimit}
          onSubmit={submitFilters}
        />

        <div className="history-card">
          {error && (
            <div
              className="history-alert"
              role="alert"
              tabIndex={error && focusError ? -1 : undefined}
              ref={alertRef}
            >
              <span>{error.message}</span>
              {error?.complement && (
                <>
                  {" "}
                  <span>{error.complement}</span>
                </>
              )}
              {" "}
              <button
                className="h-btn h-btn-ghost history-retry"
                type="button"
                onClick={() => loadHistory(page, limit, { focusOnError: true })}
              >
                {HISTORY_MESSAGES.retry}
              </button>
            </div>
          )}

          <HistoryTable
            error={error}
            hasFilters={hasAppliedFilters}
            items={items}
            loading={loading}
            onOpenDetails={abrirDetalhesDaVisita}
          />

          <HistoryPagination
            limit={limit}
            loading={loading}
            page={page}
            total={total}
            totalPages={totalPages}
            onChangePage={loadHistory}
          />
        </div>
      </div>
    </div>
  );
}
