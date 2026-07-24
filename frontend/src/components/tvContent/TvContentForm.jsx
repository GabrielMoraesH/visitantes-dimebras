import { TV_ACCEPT } from "../../utils/tvContent";
import TvBranchSelector from "./TvBranchSelector";

export default function TvContentForm({
  branches,
  form,
  msg,
  onChange,
  onSubmit,
  uploading,
}) {
  return (
    <section className="tc-card">
      <div className="tc-cardTitle">Conteúdo TV</div>

      <form className="tc-form" onSubmit={onSubmit}>
        <div className="tc-grid">
          <div className="tc-field tc-field-wide">
            <label className="tc-label">Tí­tulo da midia</label>
            <input
              className="tc-input"
              value={form.title}
              onChange={(e) => onChange("title", e.target.value)}
              placeholder="ex: Video institucional"
            />
          </div>

          <div className="tc-field">
            <label className="tc-label">Arquivo</label>
            <input
              className="tc-input"
              type="file"
              accept={TV_ACCEPT}
              onChange={(e) => onChange("file", e.target.files?.[0] || null)}
            />
          </div>

          <div className="tc-field">
            <label className="tc-label">Ordem</label>
            <input
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
          selectedIds={form.selectedBranchIds}
          onChange={(selectedIds) => onChange("selectedBranchIds", selectedIds)}
        />

        {msg && <div className="tc-alert">{msg}</div>}

        <div className="tc-formActions">
          <button className="tc-btn tc-btn-primary tc-btn-submit" type="submit" disabled={uploading}>
            {uploading ? "ENVIANDO..." : "ENVIAR MIDIA"}
          </button>
        </div>
      </form>
    </section>
  );
}
