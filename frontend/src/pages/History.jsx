import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { HistoryFilters } from "../components/history/HistoryFilters";
import { HistoryPagination } from "../components/history/HistoryPagination";
import { HistoryTable } from "../components/history/HistoryTable";
import { useHistoryData } from "../hooks/useHistoryData";
import { getUser } from "../services/session";
import "../styles/history.css";

export default function History() {
  const navigate = useNavigate();
  const user = useMemo(() => getUser(), []);
  const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";

  const {
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
  } = useHistoryData({ enabled: isAdmin });

  useEffect(() => {
    if (!isAdmin) {
      navigate("/checkin");
    }
  }, [isAdmin, navigate]);

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
            <p className="history-subtitle">Entradas e saídas registradas</p>
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

        {msg && <div className="history-alert">{msg}</div>}

        <div className="history-card">
          <HistoryTable items={items} onOpenDetails={abrirDetalhesDaVisita} />

          <HistoryPagination
            limit={limit}
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
