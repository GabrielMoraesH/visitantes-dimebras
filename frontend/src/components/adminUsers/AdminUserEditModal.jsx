import { useEffect, useMemo, useRef } from "react";
import {
  ADMIN_USER_MESSAGES,
  USER_ROLES,
  orderedFieldMessages,
} from "../../utils/adminUsers";

const ERROR_IDS = {
  username: "admin-user-edit-username-error",
  password: "admin-user-edit-password-error",
  role: "admin-user-edit-role-error",
  branchId: "admin-user-edit-branch-error",
};

function describedBy(fieldErrors, field, generalError) {
  const ids = [];
  if (fieldErrors?.[field]) ids.push(ERROR_IDS[field]);
  if (generalError) ids.push("admin-user-edit-general-alert");
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export default function AdminUserEditModal({
  branches,
  fieldErrors = {},
  form,
  generalError,
  isEditingAdmin,
  loading,
  onChange,
  onClose,
  onSubmit,
  open,
}) {
  const alertRef = useRef(null);
  const modalRef = useRef(null);
  const fieldMessages = useMemo(() => orderedFieldMessages(fieldErrors), [fieldErrors]);
  const hasAlert = fieldMessages.length > 0 || Boolean(generalError);

  useEffect(() => {
    if (open) {
      modalRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (hasAlert) {
      alertRef.current?.focus();
    }
  }, [hasAlert, fieldMessages.length, generalError]);

  if (!open || !form) return null;

  const protectedTitle = isEditingAdmin ? ADMIN_USER_MESSAGES.protectedEdit : "";

  return (
    <div
      className="au-modalOverlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="au-modal"
        onSubmit={onSubmit}
        ref={modalRef}
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-edit-title"
      >
        <div className="au-modalTitle" id="admin-user-edit-title">
          Editar usuário
        </div>

        {hasAlert && (
          <div
            className="au-alert"
            id="admin-user-edit-general-alert"
            ref={alertRef}
            role="alert"
            tabIndex="-1"
          >
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

        <label className="au-label au-modalLabel-spaced" htmlFor="admin-user-edit-username">
          Usuário
        </label>
        <input
          id="admin-user-edit-username"
          className="au-input"
          value={form.username}
          onChange={(event) => onChange("username", event.target.value)}
          autoComplete="off"
          disabled={isEditingAdmin}
          title={protectedTitle}
          aria-invalid={fieldErrors.username ? "true" : "false"}
          aria-describedby={describedBy(fieldErrors, "username", protectedTitle)}
        />
        {fieldErrors.username && (
          <div className="au-fieldError" id={ERROR_IDS.username}>
            {fieldErrors.username}
          </div>
        )}

        <label className="au-label au-modalLabel-spaced" htmlFor="admin-user-edit-password">
          Nova senha (opcional)
        </label>
        <input
          id="admin-user-edit-password"
          className="au-input"
          type="password"
          placeholder={isEditingAdmin ? "digite a nova senha" : "deixe vazio para não alterar"}
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

        <div className="au-modalGrid">
          <div className="au-field">
            <label className="au-label" htmlFor="admin-user-edit-role">
              Perfil
            </label>
            <select
              id="admin-user-edit-role"
              className="au-input"
              value={form.role}
              onChange={(event) => onChange("role", event.target.value)}
              disabled={isEditingAdmin}
              title={protectedTitle}
              aria-invalid={fieldErrors.role ? "true" : "false"}
              aria-describedby={describedBy(fieldErrors, "role", protectedTitle)}
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
            <label className="au-label" htmlFor="admin-user-edit-branch">
              Filial
            </label>
            <select
              id="admin-user-edit-branch"
              className="au-input"
              value={form.branchId}
              onChange={(event) => onChange("branchId", event.target.value)}
              disabled={isEditingAdmin}
              title={protectedTitle}
              aria-invalid={fieldErrors.branchId ? "true" : "false"}
              aria-describedby={describedBy(fieldErrors, "branchId", protectedTitle)}
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

        <div className="au-modalActions">
          <button
            className="au-btn au-btn-ghost"
            onClick={onClose}
            disabled={loading}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="au-btn au-btn-primary"
            disabled={loading}
            type="submit"
            aria-live="polite"
            aria-label={loading ? ADMIN_USER_MESSAGES.editLoadingAccessible : undefined}
          >
            {loading ? ADMIN_USER_MESSAGES.editLoading : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
