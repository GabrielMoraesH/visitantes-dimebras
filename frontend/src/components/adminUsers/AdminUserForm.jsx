import { useEffect, useMemo, useRef } from "react";
import {
  ADMIN_USER_MESSAGES,
  USER_ROLES,
  orderedFieldMessages,
} from "../../utils/adminUsers";

const ERROR_IDS = {
  username: "admin-user-create-username-error",
  password: "admin-user-create-password-error",
  role: "admin-user-create-role-error",
  branchId: "admin-user-create-branch-error",
};

function describedBy(fieldErrors, field) {
  return fieldErrors?.[field] ? ERROR_IDS[field] : undefined;
}

export default function AdminUserForm({
  branches,
  fieldErrors = {},
  form,
  generalError,
  loading,
  onChange,
  onSubmit,
}) {
  const alertRef = useRef(null);
  const fieldMessages = useMemo(() => orderedFieldMessages(fieldErrors), [fieldErrors]);
  const hasAlert = fieldMessages.length > 0 || Boolean(generalError);

  useEffect(() => {
    if (hasAlert) {
      alertRef.current?.focus();
    }
  }, [hasAlert, fieldMessages.length, generalError]);

  return (
    <section className="au-card">
      <div className="au-cardTitle">Criar usuário</div>

      <form className="au-form" onSubmit={onSubmit}>
        <div className="au-grid">
          <div className="au-field">
            <label className="au-label" htmlFor="admin-user-create-username">
              Usuário
            </label>
            <input
              id="admin-user-create-username"
              className="au-input"
              placeholder="ex: recepcao2"
              value={form.username}
              onChange={(event) => onChange("username", event.target.value)}
              autoComplete="off"
              aria-invalid={fieldErrors.username ? "true" : "false"}
              aria-describedby={describedBy(fieldErrors, "username")}
            />
            {fieldErrors.username && (
              <div className="au-fieldError" id={ERROR_IDS.username}>
                {fieldErrors.username}
              </div>
            )}
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="admin-user-create-password">
              Senha
            </label>
            <input
              id="admin-user-create-password"
              className="au-input"
              type="password"
              placeholder="pelo menos 6 caracteres"
              value={form.password}
              onChange={(event) => onChange("password", event.target.value)}
              autoComplete="new-password"
              aria-invalid={fieldErrors.password ? "true" : "false"}
              aria-describedby={describedBy(fieldErrors, "password")}
            />
            {fieldErrors.password && (
              <div className="au-fieldError" id={ERROR_IDS.password}>
                {fieldErrors.password}
              </div>
            )}
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="admin-user-create-role">
              Perfil
            </label>
            <select
              id="admin-user-create-role"
              className="au-input"
              value={form.role}
              onChange={(event) => onChange("role", event.target.value)}
              aria-invalid={fieldErrors.role ? "true" : "false"}
              aria-describedby={describedBy(fieldErrors, "role")}
            >
              {USER_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            {fieldErrors.role && (
              <div className="au-fieldError" id={ERROR_IDS.role}>
                {fieldErrors.role}
              </div>
            )}
          </div>

          <div className="au-field">
            <label className="au-label" htmlFor="admin-user-create-branch">
              Filial
            </label>
            <select
              id="admin-user-create-branch"
              className="au-input"
              value={form.branchId}
              onChange={(event) => onChange("branchId", event.target.value)}
              aria-invalid={fieldErrors.branchId ? "true" : "false"}
              aria-describedby={describedBy(fieldErrors, "branchId")}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </option>
              ))}
            </select>
            {fieldErrors.branchId && (
              <div className="au-fieldError" id={ERROR_IDS.branchId}>
                {fieldErrors.branchId}
              </div>
            )}
          </div>
        </div>

        {hasAlert && (
          <div className="au-alert" ref={alertRef} role="alert" tabIndex="-1">
            {fieldMessages.length > 0 ? (
              <>
                <div className="au-alertTitle">{ADMIN_USER_MESSAGES.fieldsTitle}</div>
                <ul className="au-alertList">
                  {fieldMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </>
            ) : (
              generalError
            )}
          </div>
        )}

        <button
          className="au-btn au-btn-primary au-btn-full"
          type="submit"
          disabled={loading}
          aria-live="polite"
          aria-label={loading ? ADMIN_USER_MESSAGES.createLoadingAccessible : undefined}
        >
          {loading ? ADMIN_USER_MESSAGES.createLoading : "Criar usuário"}
        </button>
      </form>
    </section>
  );
}
