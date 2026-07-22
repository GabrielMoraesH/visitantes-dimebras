import { formatHistoryDate } from "../../utils/history";

function HistoryRow({ visit, onOpenDetails }) {
  const clickable = Boolean(Number(visit?.id));

  return (
    <tr>
      <td>{formatHistoryDate(visit.checkinAt)}</td>

      <td>
        {visit.checkoutAt ? (
          formatHistoryDate(visit.checkoutAt)
        ) : (
          <span className="pill pill-open">Aberto</span>
        )}
      </td>

      <td>
        <span
          className={clickable ? "history-linkCell" : ""}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={() => clickable && onOpenDetails(visit.id)}
          onKeyDown={(event) => {
            if (!clickable) return;

            if (event.key === "Enter") {
              onOpenDetails(visit.id);
            }
          }}
          title={clickable ? "Ver detalhes da visita" : ""}
        >
          {visit.visitor?.name || "-"}
        </span>
      </td>

      <td>{visit.visitor?.cpf || "-"}</td>
      <td>{visit.visitor?.company || "-"}</td>
      <td>{visit.attendedBy || "-"}</td>
      <td>{visit.checkinByUser?.username || "-"}</td>
      <td>{visit.checkoutByUser?.username || "-"}</td>
      <td>{visit.branchName || visit.branch?.name || "-"}</td>
    </tr>
  );
}

export function HistoryTable({ items, onOpenDetails }) {
  return (
    <div className="history-tableWrap">
      <table className="history-table">
        <thead>
          <tr>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Nome do Visitante</th>
            <th>Documento</th>
            <th>Empresa</th>
            <th>Anfitrião</th>
            <th>Registrado por(In)</th>
            <th>Registrado por(Out)</th>
            <th>Filial</th>
          </tr>
        </thead>

        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan="9" className="history-empty">
                Nenhum registro encontrado.
              </td>
            </tr>
          ) : (
            items.map((visit) => (
              <HistoryRow
                key={visit.id}
                visit={visit}
                onOpenDetails={onOpenDetails}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
