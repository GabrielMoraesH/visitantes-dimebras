export default function AdminUserStatusBadge({ isActive }) {
  return (
    <span className={`au-status ${isActive ? "is-on" : "is-off"}`}>
      {isActive ? "Ativo" : "Desativado"}
    </span>
  );
}
