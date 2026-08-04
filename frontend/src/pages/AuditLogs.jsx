import { useEffect, useRef, useState } from "react";
import Header from "../components/Header";
import { useAuditLogs } from "../hooks/useAuditLogs";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AUDIT_PAGE_SIZES,
  auditActionTone,
  auditBranchLabel,
  auditUserLabel,
  formatAuditActionLabel,
  formatAuditDateTime,
  formatAuditEntityLabel,
  formatMetadata,
} from "../utils/auditLogs";
import "../styles/auditLogs.css";

function AuditFilters({
  branches,
  filters,
  loading,
  pageSize,
  users,
  onApply,
  onChange,
  onChangePageSize,
  onClear,
}) {
  return (
    <form
      className="auditFilters"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <label className="auditField">
        <span>Data inicial</span>
        <input
          className="auditInput"
          type="date"
          value={filters.from}
          onChange={(event) => onChange("from", event.target.value)}
        />
      </label>

      <label className="auditField">
        <span>Data final</span>
        <input
          className="auditInput"
          type="date"
          value={filters.to}
          onChange={(event) => onChange("to", event.target.value)}
        />
      </label>

      <label className="auditField">
        <span>Acao</span>
        <select
          className="auditInput"
          value={filters.action}
          onChange={(event) => onChange("action", event.target.value)}
        >
          <option value="">Todas</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {formatAuditActionLabel(action)}
            </option>
          ))}
        </select>
      </label>

      <label className="auditField">
        <span>Entidade</span>
        <select
          className="auditInput"
          value={filters.entity}
          onChange={(event) => onChange("entity", event.target.value)}
        >
          <option value="">Todas</option>
          {AUDIT_ENTITIES.map((entity) => (
            <option key={entity} value={entity}>
              {formatAuditEntityLabel(entity)}
            </option>
          ))}
        </select>
      </label>

      <label className="auditField">
        <span>Usuário</span>
        <select
          className="auditInput"
          value={filters.userId}
          onChange={(event) => onChange("userId", event.target.value)}
        >
          <option value="">Todos</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username}
            </option>
          ))}
        </select>
      </label>

      <label className="auditField">
        <span>Filial</span>
        <select
          className="auditInput"
          value={filters.branchId}
          onChange={(event) => onChange("branchId", event.target.value)}
        >
          <option value="">Todas</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>

      <label className="auditField">
        <span>Identificador da entidade</span>
        <input
          className="auditInput"
          value={filters.entityId}
          onChange={(event) => onChange("entityId", event.target.value)}
        />
      </label>

      <label className="auditField">
        <span>Request ID</span>
        <input
          className="auditInput"
          value={filters.requestId}
          onChange={(event) => onChange("requestId", event.target.value)}
        />
      </label>

      <label className="auditField">
        <span>Itens por página</span>
        <select
          className="auditInput"
          value={pageSize}
          onChange={(event) => onChangePageSize(event.target.value)}
        >
          {AUDIT_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className="auditFilterActions">
        <button className="auditBtn auditBtn-primary" type="submit" disabled={loading}>
          Aplicar filtros
        </button>
        <button className="auditBtn auditBtn-ghost" type="button" onClick={onClear} disabled={loading}>
          Limpar filtros
        </button>
      </div>
    </form>
  );
}

function AuditBadge({ type, value }) {
  const label = type === "entity" ? formatAuditEntityLabel(value) : formatAuditActionLabel(value);

  return (
    <span
      className={`auditBadge auditBadge-${type === "entity" ? "entity" : auditActionTone(value)}`}
      title={label}
    >
      {label}
    </span>
  );
}

function AuditDateTime({ value }) {
  const formatted = formatAuditDateTime(value);
  const [date, time] = formatted.split(" ");

  return (
    <span className="auditDateTime" title={formatted}>
      <span>{date || "-"}</span>
      {time && <span className="auditTime">{time}</span>}
    </span>
  );
}

function displayDescription(description) {
  return String(description || "").trim() || "—";
}

function AuditTable({ items, loading, onOpenDetails }) {
  return (
    <div className="auditTableWrap">
      <table className="auditTable">
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Usuário</th>
            <th>Filial</th>
            <th>Ação</th>
            <th>Entidade</th>
            <th>ID</th>
            <th>Descrição</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody aria-busy={loading ? "true" : "false"}>
          {items.length === 0 ? (
            <tr>
              <td className="auditEmpty" colSpan="8">
                Nenhum registro de auditoria encontrado para os filtros informados.
              </td>
            </tr>
          ) : (
            items.map((log) => {
              const description = displayDescription(log.description);

              return (
                <tr key={log.id}>
                  <td>
                    <AuditDateTime value={log.createdAt} />
                  </td>
                  <td title={auditUserLabel(log)}>{auditUserLabel(log)}</td>
                  <td title={auditBranchLabel(log)}>{auditBranchLabel(log)}</td>
                  <td>
                    <AuditBadge value={log.action} />
                  </td>
                  <td>
                    <AuditBadge type="entity" value={log.entity} />
                  </td>
                  <td title={log.entityId || "-"}>{log.entityId || "-"}</td>
                  <td className="auditDescription" title={description}>
                    {description}
                  </td>
                  <td>
                    <button
                      className="auditLinkBtn"
                      type="button"
                      onClick={(event) => onOpenDetails(log, event.currentTarget)}
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="auditDetailRow">
      <dt>{label}</dt>
      <dd>{children || "-"}</dd>
    </div>
  );
}

function AuditDetailsModal({ log, onClose, openerRef }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!log) return undefined;

    const previousOverflow = document.body.style.overflow;
    const opener = openerRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [log, onClose, openerRef]);

  if (!log) return null;

  return (
    <div className="auditModalBackdrop" onMouseDown={onClose}>
      <section
        className="auditModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auditDetailsTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="auditModalHeader">
          <h3 id="auditDetailsTitle">Detalhes da auditoria</h3>
          <button
            className="auditModalClose"
            type="button"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Fechar detalhes"
          >
            Fechar
          </button>
        </div>

        <dl className="auditDetails">
          <DetailRow label="Data/Hora">{formatAuditDateTime(log.createdAt)}</DetailRow>
          <DetailRow label="Ação">{formatAuditActionLabel(log.action)}</DetailRow>
          <DetailRow label="Entidade">{formatAuditEntityLabel(log.entity)}</DetailRow>
          <DetailRow label="Identificador">{log.entityId}</DetailRow>
          <DetailRow label="Usuário">{auditUserLabel(log)}</DetailRow>
          <DetailRow label="Filial">{auditBranchLabel(log)}</DetailRow>
          <DetailRow label="Descrição">{log.description}</DetailRow>
          <DetailRow label="Request ID">{log.requestId}</DetailRow>
          <DetailRow label="IP">{log.ipAddress}</DetailRow>
          <DetailRow label="User Agent">{log.userAgent}</DetailRow>
        </dl>

        <div className="auditMetadata">
          <h4>Metadata</h4>
          <pre>{formatMetadata(log.metadata)}</pre>
        </div>
      </section>
    </div>
  );
}

function AuditPagination({ loading, page, pageSize, total, totalPages, onPageChange }) {
  const hasPages = totalPages > 0;

  return (
    <div className="auditPagination">
      <div className="auditPaginationInfo">
        Total: {total} | Página {hasPages ? page : 0} de {totalPages}
      </div>
      <div className="auditPaginationActions">
        <button
          className="auditBtn auditBtn-ghost"
          type="button"
          disabled={loading || !hasPages || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        <button
          className="auditBtn auditBtn-ghost"
          type="button"
          disabled={loading || !hasPages || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </button>
      </div>
      <span className="auditPageSizeText">{pageSize} por página</span>
    </div>
  );
}

export default function AuditLogs() {
  const [selectedLog, setSelectedLog] = useState(null);
  const openerRef = useRef(null);
  const audit = useAuditLogs({ enabled: true });

  function openDetails(log, opener) {
    openerRef.current = opener;
    setSelectedLog(log);
  }

  function closeDetails() {
    setSelectedLog(null);
  }

  return (
    <div className="auditPage">
      <Header />

      <main className="auditContainer">
        <div className="auditHeader">
          <div>
            <h1>Auditoria</h1>
            <p>Logs administrativos de acesso e operação.</p>
          </div>
          <div className="auditSummary" aria-live="polite">
            {audit.loading ? "Atualizando..." : `${audit.total} registros`}
          </div>
        </div>

        <AuditFilters
          branches={audit.branches}
          filters={audit.draftFilters}
          loading={audit.loading}
          pageSize={audit.pageSize}
          users={audit.users}
          onApply={audit.applyFilters}
          onChange={audit.setFilter}
          onChangePageSize={audit.changePageSize}
          onClear={audit.clearFilters}
        />

        {audit.initialLoading && (
          <div className="auditNotice" role="status" aria-live="polite">
            Carregando auditoria...
          </div>
        )}

        {audit.error && (
          <div className="auditError" role="alert">
            {audit.error}
          </div>
        )}

        <section className="auditCard">
          <AuditTable items={audit.items} loading={audit.loading} onOpenDetails={openDetails} />
          <AuditPagination
            loading={audit.loading}
            page={audit.page}
            pageSize={audit.pageSize}
            total={audit.total}
            totalPages={audit.totalPages}
            onPageChange={audit.setPage}
          />
        </section>
      </main>

      <AuditDetailsModal log={selectedLog} onClose={closeDetails} openerRef={openerRef} />
    </div>
  );
}
