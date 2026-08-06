import { useEffect, useMemo, useRef } from "react";
import { TV_ACCEPT } from "../../utils/tvContent";
import TvBranchSelector from "./TvBranchSelector";

function fieldError(errors, field) {
  return errors.find((error) => error.field === field)?.message || "";
}

function ValidationSummary({ errors, alertRef }) {
  if (errors.length === 0) return null;

  return (
    <div className="tc-alert" role="alert" tabIndex="-1" ref={alertRef}>
      <div className="tc-alertTitle">Corrija os campos:</div>
      <ul>
        {errors.map((error) => (
          <li key={`${error.field}-${error.message}`}>{error.message}</li>
        ))}
      </ul>
    </div>
  );
}

export default function TvContentForm({
  branches,
  errors = [],
  form,
  msg,
  onChange,
  onSubmit,
  uploading,
}) {
  const alertRef = useRef(null);
  const errorByField = useMemo(
    () => ({
      title: fieldError(errors, "title"),
      file: fieldError(errors, "file"),
      branches: fieldError(errors, "branches"),
    }),
    [errors]
  );

  useEffect(() => {
    if (errors.length > 0) alertRef.current?.focus();
  }, [errors]);

  return (
    <section className="tc-card">
      <div className="tc-cardTitle">Conteúdo TV</div>

      <form className="tc-form" onSubmit={onSubmit}>
        <ValidationSummary errors={errors} alertRef={alertRef} />

        {msg && (
          <div className="tc-alert" role="alert">
            {msg}
          </div>
        )}

        <div className="tc-grid">
          <div className="tc-field tc-field-wide">
            <label className="tc-label" htmlFor="tv-content-title">
              Título da mídia
            </label>
            <input
              id="tv-content-title"
              className="tc-input"
              value={form.title}
              onChange={(e) => onChange("title", e.target.value)}
              placeholder="ex: Vídeo institucional"
              aria-invalid={errorByField.title ? "true" : undefined}
              aria-describedby={errorByField.title ? "tv-content-title-error" : undefined}
            />
            {errorByField.title ? (
              <div className="tc-fieldError" id="tv-content-title-error">
                {errorByField.title}
              </div>
            ) : null}
          </div>

          <div className="tc-field">
            <label className="tc-label" htmlFor="tv-content-file">
              Mídia
            </label>
            <input
              id="tv-content-file"
              className="tc-input"
              type="file"
              accept={TV_ACCEPT}
              onChange={(e) => onChange("file", e.target.files?.[0] || null)}
              aria-invalid={errorByField.file ? "true" : undefined}
              aria-describedby={errorByField.file ? "tv-content-file-error" : undefined}
            />
            {errorByField.file ? (
              <div className="tc-fieldError" id="tv-content-file-error">
                {errorByField.file}
              </div>
            ) : null}
          </div>

          <div className="tc-field">
            <label className="tc-label" htmlFor="tv-content-order">
              Ordem
            </label>
            <input
              id="tv-content-order"
              className="tc-input"
              type="number"
              value={form.order}
              onChange={(e) => onChange("order", e.target.value)}
            />
          </div>

          <label className="tc-check">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => onChange("isActive", e.target.checked)}
            />
            <span>Ativo</span>
          </label>
        </div>

        <TvBranchSelector
          branches={branches}
          error={errorByField.branches}
          idPrefix="tv-content"
          selectedIds={form.selectedBranchIds}
          onChange={(selectedIds) => onChange("selectedBranchIds", selectedIds)}
        />

        <div className="tc-formActions">
          <button className="tc-btn tc-btn-primary tc-btn-submit" type="submit" disabled={uploading}>
            {uploading ? "Enviando conteúdo..." : "Enviar mídia"}
          </button>
        </div>
      </form>
    </section>
  );
}
