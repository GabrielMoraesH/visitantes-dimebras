import { USER_ROLES } from "../../utils/adminUsers";

export default function AdminUserForm({
  branches,
  form,
  loading,
  msg,
  onChange,
  onSubmit,
}) {
  return (
    <section className="au-card">
      <div className="au-cardTitle">Criar usuário</div>

      <form className="au-form" onSubmit={onSubmit}>
        <div className="au-grid">
          <div className="au-field">
            <label className="au-label">Username</label>
            <input
              className="au-input"
              placeholder="ex: recepcao2"
              value={form.username}
              onChange={(event) => onChange("username", event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="au-field">
            <label className="au-label">Senha</label>
            <input
              className="au-input"
              type="password"
              placeholder="mínimo 6 caracteres"
              value={form.password}
              onChange={(event) => onChange("password", event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="au-field">
            <label className="au-label">Cargo</label>
            <select
              className="au-input"
              value={form.role}
              onChange={(event) => onChange("role", event.target.value)}
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
            >
              {branches.map((branch) => (
                <option key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {msg && <div className="au-alert">{msg}</div>}

        <button
          className="au-btn au-btn-primary au-btn-full"
          type="submit"
          disabled={loading}
        >
          {loading ? "CRIANDO..." : "CRIAR USUÁRIO"}
        </button>
      </form>
    </section>
  );
}
