import { isAdminUserId } from "../../utils/adminUsers";

function PencilIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08ZM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DisableIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm0 2a7.96 7.96 0 0 1 4.9 1.7L5.7 16.9A8 8 0 0 1 12 4Zm0 16a7.96 7.96 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AdminUserActions({
  disableLoading,
  onEdit,
  onToggleStatus,
  user,
}) {
  return (
    <div className="au-actions">
      <button
        className="au-iconBtn au-iconBtn-edit"
        onClick={() => onEdit(user)}
        title="Editar usuário"
        type="button"
      >
        <PencilIcon />
      </button>

      <button
        className="au-iconBtn au-iconBtn-del"
        onClick={() => onToggleStatus(user)}
        disabled={isAdminUserId(user.id) || disableLoading}
        title={user.isActive ? "Desativar usuário" : "Reativar usuário"}
        type="button"
      >
        <DisableIcon />
      </button>
    </div>
  );
}
