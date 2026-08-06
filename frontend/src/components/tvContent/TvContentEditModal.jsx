import { useEffect, useMemo, useRef } from "react";
import TvBranchSelector from "./TvBranchSelector";

function fieldError(errors, field) {
  return errors.find((error) => error.field === field)?.message || "";
}

export default function TvContentEditModal({
  branches,
  editForm,
  editLoading,
  errors = [],
  onChange,
  onClose,
  onSubmit,
}) {
  const alertRef = useRef(null);
  const closeButtonRef = useRef(null);
  const errorByField = useMemo(
    () => ({
      title: fieldError(errors, "title"),
      branches: fieldError(errors, "branches"),
    }),
    [errors]
  );

  useEffect(() => {
    if (!editForm) return;
    closeButtonRef.current?.focus();
  }, [editForm]);

  useEffect(() => {
    if (errors.length > 0) alertRef.current?.focus();
  }, [errors]);

  if (!editForm) return null;

  return (
    <div
      className="tc-modalOverlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        className="tc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-content-edit-title"
        onSubmit={onSubmit}
      >
        <div className="tc-modalTitle" id="tv-content-edit-title">
          Editar conteúdo
        </div>

        {errors.length > 0 ? (
          <div className="tc-alert" role="alert" tabIndex="-1" ref={alertRef}>
            <div className="tc-alertTitle">Corrija os campos:</div>
            <ul>
              {errors.map((error) => (
                <li key={`${error.field}-${error.message}`}>{error.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="tc-field tc-modalLabel-spaced">
          <label className="tc-label" htmlFor="tv-content-edit-title-input">
            Título
          </label>
          <input
            id="tv-content-edit-title-input"
            className="tc-input"
            value={editForm.title}
            onChange={(e) => onChange("title", e.target.value)}
            aria-invalid={errorByField.title ? "true" : undefined}
            aria-describedby={errorByField.title ? "tv-content-edit-title-error" : undefined}
          />
          {errorByField.title ? (
            <div className="tc-fieldError" id="tv-content-edit-title-error">
              {errorByField.title}
            </div>
          ) : null}
        </div>

        <div className="tc-modalGrid">
          <div className="tc-field">
            <label className="tc-label" htmlFor="tv-content-edit-order">
              Ordem
            </label>
            <input
              id="tv-content-edit-order"
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
          error={errorByField.branches}
          idPrefix="tv-content-edit"
          selectedIds={editForm.branchIds}
          onChange={(branchIds) => onChange("branchIds", branchIds)}
        />

        <div className="tc-modalActions">
          <button
            ref={closeButtonRef}
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
            {editLoading ? "Salvando alterações..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
