export function HistoryPagination({
  limit,
  page,
  total,
  totalPages,
  onChangePage,
}) {
  return (
    <div className="history-pagination">
      <div className="history-pagination-info">
        Total: {total} • Página {page} de {totalPages}
      </div>

      <div className="history-pagination-actions">
        <button
          className="h-btn h-btn-ghost"
          onClick={() => onChangePage(page - 1, limit)}
          disabled={page <= 1}
          type="button"
        >
          ◀ Anterior
        </button>

        <button
          className="h-btn h-btn-ghost"
          onClick={() => onChangePage(page + 1, limit)}
          disabled={page >= totalPages}
          type="button"
        >
          Próxima ▶
        </button>
      </div>
    </div>
  );
}
