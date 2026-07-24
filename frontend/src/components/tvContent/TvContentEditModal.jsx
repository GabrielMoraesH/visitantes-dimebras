import TvBranchSelector from "./TvBranchSelector";

export default function TvContentEditModal({
  branches,
  editForm,
  editLoading,
  onChange,
  onClose,
  onSubmit,
}) {
  if (!editForm) return null;

  return (
    <div
      className="tc-modalOverlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form className="tc-modal" onSubmit={onSubmit}>
        <div className="tc-modalTitle">Editar conteúdo</div>

        <div className="tc-field tc-modalLabel-spaced">
          <label className="tc-label">Tí­tulo</label>
          <input
            className="tc-input"
            value={editForm.title}
            onChange={(e) => onChange("title", e.target.value)}
          />
        </div>

        <div className="tc-modalGrid">
          <div className="tc-field">
            <label className="tc-label">Ordem</label>
            <input
              className="tc-input"
              type="number"
              value={editForm.order}
              onChange={(e) => onChange("order", e.target.value)}
            />
          </div>

          <label className="tc-check tc-check-modal">
            <input
              type="checkbox"
              checked={editForm.isActive}
              onChange={(e) => onChange("isActive", e.target.checked)}
            />
            <span>Ativo</span>
          </label>
        </div>

        <TvBranchSelector
          branches={branches}
          selectedIds={editForm.branchIds}
          onChange={(branchIds) => onChange("branchIds", branchIds)}
        />

        <div className="tc-modalActions">
          <button
            className="tc-btn tc-btn-ghost"
            onClick={onClose}
            disabled={editLoading}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="tc-btn tc-btn-primary"
            disabled={editLoading}
            type="submit"
          >
            {editLoading ? "SALVANDO..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
