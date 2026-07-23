export default function AdminUserStatusBadge({ isActive }) {
  return (
    <span className={`au-status ${isActive ? "is-on" : "is-off"}`}>
      {isActive ? "ATIVO" : "DESATIVADO"}
    </span>
  );
}
