import { formatDateTime } from "../../utils/checkin";

export default function OpenVisitsList({
  isAdmin,
  loading,
  initialLoading,
  refreshing,
  openVisits,
  onRefresh,
  onOpenLabel,
}) {
  return (
    <section className="card card-search openvisits-card">
      <div className="card-title openvisits-header">
        <span>{isAdmin ? "Check-ins em aberto - Todas as filiais" : "Check-ins em aberto (minha filial)"}</span>

        <button
          className="btn btn-light"
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
        >
          {loading ? "CARREGANDO..." : refreshing ? "ATUALIZANDO..." : "ATUALIZAR"}
        </button>
      </div>

      {refreshing && openVisits.length > 0 && <div className="openvisits-refreshing">Atualizando...</div>}

      {initialLoading && openVisits.length === 0 ? (
        <div className="openvisits-empty">Carregando...</div>
      ) : openVisits.length === 0 ? (
        <div className="openvisits-empty">
          {isAdmin ? "Nenhum check-in em aberto em todas as filiais." : "Nenhum check-in em aberto nesta filial."}
        </div>
      ) : (
        <div className="openvisits-tableWrapper">
          <table className="openvisits-table">
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Visitante</th>
                <th>CPF</th>
                <th>Empresa</th>
                {isAdmin && <th>Unidade</th>}
                <th>Setor</th>
                <th>Falar com</th>
                <th className="actions-col">Ações</th>
              </tr>
            </thead>

            <tbody>
              {openVisits.map((visit) => (
                <tr key={visit.id}>
                  <td>{formatDateTime(visit.checkinAt)}</td>
                  <td>{visit.visitor?.name || "-"}</td>
                  <td>{visit.visitor?.cpf || "-"}</td>
                  <td>{visit.visitor?.company || "-"}</td>
                  {isAdmin && <td>{visit.branchName || "-"}</td>}
                  <td>{visit.areaToVisit || "-"}</td>
                  <td>{visit.attendedBy || "-"}</td>
                  <td className="actions-col">
                    <button className="btn btn-light btn-small" type="button" onClick={() => onOpenLabel(visit.id)}>
                      ETIQUETA
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
