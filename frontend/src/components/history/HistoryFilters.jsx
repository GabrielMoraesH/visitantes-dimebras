export function HistoryFilters({
  branches,
  filters,
  limit,
  onChangeFilter,
  onChangeLimit,
  onSubmit,
}) {
  return (
    <form
      className="history-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="h-input"
        placeholder="Filtrar por CPF..."
        value={filters.cpf}
        onChange={(event) => onChangeFilter("cpf", event.target.value)}
        inputMode="numeric"
        aria-label="Filtrar por CPF"
      />

      <select
        className="h-input"
        value={filters.branchName}
        onChange={(event) => onChangeFilter("branchName", event.target.value)}
        aria-label="Filtrar por filial"
      >
        <option value="all">Filial: Todas</option>

        {branches.map((branch) => (
          <option key={branch.id ?? branch.name} value={branch.name}>
            Filial: {branch.name}
          </option>
        ))}
      </select>

      <select
        className="h-input"
        value={filters.status}
        onChange={(event) => onChangeFilter("status", event.target.value)}
        aria-label="Filtrar por status"
      >
        <option value="all">Status: Todos</option>
        <option value="open">Status: Abertos</option>
        <option value="closed">Status: Finalizados</option>
      </select>

      <input
        className="h-input"
        type="date"
        value={filters.date}
        onChange={(event) => onChangeFilter("date", event.target.value)}
        title="Filtrar por dia (check-in)"
        aria-label="Filtrar por dia"
      />

      <select
        className="h-input"
        value={limit}
        onChange={(event) => onChangeLimit(event.target.value)}
        title="Itens por página"
        aria-label="Itens por página"
      >
        <option value={10}>Mostrar 10</option>
        <option value={25}>Mostrar 25</option>
        <option value={50}>Mostrar 50</option>
        <option value={100}>Mostrar 100</option>
      </select>

      <button type="submit" className="h-btn h-btn-primary">
        Filtrar
      </button>
    </form>
  );
}
