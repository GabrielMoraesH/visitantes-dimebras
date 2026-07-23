import { formatUserCreatedAt } from "../../utils/adminUsers";
import AdminUserActions from "./AdminUserActions";
import AdminUserStatusBadge from "./AdminUserStatusBadge";

export default function AdminUsersTable({
  disableLoading,
  onEdit,
  onToggleStatus,
  users,
}) {
  return (
    <section className="au-card">
      <div className="au-cardHeader">
        <div className="au-cardTitle">Usuários cadastrados</div>
        <div className="au-pill">{users.length} total</div>
      </div>

      <div className="au-tableWrap">
        <table className="au-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Role</th>
              <th>Filial</th>
              <th>Status</th>
              <th>Criado em</th>
              <th className="au-actions-col">Ações</th>
            </tr>
          </thead>

          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="7" className="au-empty">
                  Nenhum usuário encontrado.
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
                      disableLoading={disableLoading}
                      onEdit={onEdit}
                      onToggleStatus={onToggleStatus}
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
