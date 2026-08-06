import { ADMIN_USER_MESSAGES, formatUserCreatedAt } from "../../utils/adminUsers";
import AdminUserActions from "./AdminUserActions";
import AdminUserStatusBadge from "./AdminUserStatusBadge";

export default function AdminUsersTable({
  msg,
  onEdit,
  onToggleStatus,
  statusLoadingAction,
  statusLoadingUserId,
  users,
  usersLoading,
}) {
  return (
    <section className="au-card">
      <div className="au-cardHeader">
        <div className="au-cardTitle">Usuários cadastrados</div>
        <div className="au-pill">{users.length} total</div>
      </div>

      {msg && (
        <div className="au-alert au-alert-spaced" role="alert" tabIndex="-1">
          {msg}
        </div>
      )}

      <div className="au-tableWrap">
        <table className="au-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Filial</th>
              <th>Status</th>
              <th>Criado em</th>
              <th className="au-actions-col">Ações</th>
            </tr>
          </thead>

          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  className="au-empty"
                  role={usersLoading ? "status" : undefined}
                  aria-live={usersLoading ? "polite" : undefined}
                >
                  {usersLoading ? ADMIN_USER_MESSAGES.listLoading : ADMIN_USER_MESSAGES.empty}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className={user.isActive === false ? "au-row-disabled" : undefined}
                >
                  <td>{user.id}</td>
                  <td>{user.username}</td>
                  <td>{user.role}</td>
                  <td>{user.branch?.name || "-"}</td>
                  <td>
                    <AdminUserStatusBadge isActive={user.isActive} />
                  </td>
                  <td>{formatUserCreatedAt(user.createdAt)}</td>
                  <td>
                    <AdminUserActions
                      onEdit={onEdit}
                      onToggleStatus={onToggleStatus}
                      statusLoadingAction={statusLoadingAction}
                      statusLoadingUserId={statusLoadingUserId}
                      user={user}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
