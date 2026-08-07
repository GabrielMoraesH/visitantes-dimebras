import { formatHistoryDateParts, HISTORY_MESSAGES } from "../../utils/history";

function HistoryDateTime({ value }) {
  const { date, time } = formatHistoryDateParts(value);

  if (date === "-" && time === "-") return "-";

  return (
    <span className="history-dateTime">
      <span>{date}</span>
      <span>{time}</span>
    </span>
  );
}

function HistoryRow({ visit, onOpenDetails }) {
  const clickable = Boolean(Number(visit?.id));
  const visitorName = visit.visitor?.name || "visitante";

  return (
    <tr>
      <td>
        <HistoryDateTime value={visit.checkinAt} />
      </td>

      <td>
        {visit.checkoutAt ? (
          <HistoryDateTime value={visit.checkoutAt} />
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
          aria-label={clickable ? `Detalhes da visita de ${visitorName}` : undefined}
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

export function HistoryTable({ error, hasFilters, items, loading, onOpenDetails }) {
  const emptyText = hasFilters ? HISTORY_MESSAGES.emptyWithFilters : HISTORY_MESSAGES.empty;

  return (
    <div className="history-tableWrap">
      <table className="history-table">
        <thead>
          <tr>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Visitante</th>
            <th>CPF</th>
            <th>Empresa</th>
            <th>Anfitrião</th>
            <th>Registrado por check-in</th>
            <th>Registrado por check-out</th>
            <th>Filial</th>
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan="9" className="history-empty">
                <span
                  aria-label={HISTORY_MESSAGES.loadingAccessible}
                  aria-live="polite"
                  role="status"
                >
                  {HISTORY_MESSAGES.loading}
                </span>
              </td>
            </tr>
          ) : error ? null : items.length === 0 ? (
            <tr>
              <td colSpan="9" className="history-empty">
                {emptyText}
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
