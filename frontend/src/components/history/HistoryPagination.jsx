export function HistoryPagination({
  limit,
  loading,
  page,
  total,
  totalPages,
  onChangePage,
}) {
  const safeTotalPages = Math.max(1, Number(totalPages || 1));
  const safePage = Math.min(Math.max(1, Number(page || 1)), safeTotalPages);
  const totalLabel = Number(total) === 1 ? "1 registro" : `${Number(total || 0)} registros`;

  return (
    <div className="history-pagination">
      <div className="history-pagination-info">
        {totalLabel} - Página {safePage} de {safeTotalPages}
      </div>

      <div className="history-pagination-actions">
        <button
          className="h-btn h-btn-ghost"
          onClick={() => onChangePage(page - 1, limit, { focusOnError: true })}
          disabled={loading || page <= 1}
          type="button"
          aria-label="Página anterior"
        >
          Anterior
        </button>

        <button
          className="h-btn h-btn-ghost"
          onClick={() => onChangePage(page + 1, limit, { focusOnError: true })}
          disabled={loading || page >= safeTotalPages}
          type="button"
          aria-label="Próxima página"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
