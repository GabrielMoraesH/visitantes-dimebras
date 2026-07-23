import { USER_ROLES } from "../../utils/adminUsers";

export default function AdminUserEditModal({
  branches,
  form,
  isEditingAdmin,
  loading,
  onChange,
  onClose,
  onSubmit,
  open,
}) {
  if (!open || !form) return null;

  const adminTitle = isEditingAdmin
    ? "No ADMIN (id=1) só é permitido alterar a senha"
    : "";

  return (
    <div
      className="au-modalOverlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="au-modal" onSubmit={onSubmit}>
        <div className="au-modalTitle">Editar usuário</div>

        <label className="au-label au-modalLabel-spaced">Username</label>
        <input
          className="au-input"
          value={form.username}
          onChange={(event) => onChange("username", event.target.value)}
          autoComplete="off"
          disabled={isEditingAdmin}
          title={adminTitle}
        />

        <label className="au-label au-modalLabel-spaced">
          Nova senha (opcional)
        </label>
        <input
          className="au-input"
          type="password"
          placeholder={
            isEditingAdmin
              ? "digite a nova senha do ADMIN"
              : "deixe vazio para não alterar"
          }
          value={form.password}
          onChange={(event) => onChange("password", event.target.value)}
          autoComplete="new-password"
        />

        <div className="au-modalGrid">
          <div className="au-field">
            <label className="au-label">Cargo</label>
            <select
              className="au-input"
              value={form.role}
              onChange={(event) => onChange("role", event.target.value)}
              disabled={isEditingAdmin}
              title={adminTitle}
            >
              {USER_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div className="au-field">
            <label className="au-label">Filial</label>
            <select
              className="au-input"
              value={form.branchId}
              onChange={(event) => onChange("branchId", event.target.value)}
              disabled={isEditingAdmin}
              title={adminTitle}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="au-modalActions">
          <button
            className="au-btn au-btn-ghost"
            onClick={onClose}
            disabled={loading}
            type="button"
          >
            Cancelar
          </button>
          <button className="au-btn au-btn-primary" disabled={loading} type="submit">
            {loading ? "SALVANDO..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
