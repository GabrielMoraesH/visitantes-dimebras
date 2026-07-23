import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AdminUserEditModal from "../components/adminUsers/AdminUserEditModal";
import AdminUserForm from "../components/adminUsers/AdminUserForm";
import AdminUsersTable from "../components/adminUsers/AdminUsersTable";
import AdminUsersTopbar from "../components/adminUsers/AdminUsersTopbar";
import { useConfirm } from "../components/Feedback/ConfirmProvider";
import { useToast } from "../components/Feedback/ToastProvider";
import { useAdminUsers } from "../hooks/useAdminUsers";
import { getToken, getUser } from "../services/session";
import "../styles/adminUsers.css";

export default function AdminUsers() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === "ADMIN";

  function showToast(text, type = "success") {
    toast[type]?.(text) ?? toast.show(text, type);
  }

  const adminUsers = useAdminUsers({
    enabled: isAdmin,
    confirm,
    showToast,
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return navigate("/login");
    if (!isAdmin) return navigate("/checkin");
  }, [navigate, isAdmin]);

  function goToCheckin() {
    navigate("/checkin");
  }

  return (
    <div className="adminUsers-page">
      <AdminUsersTopbar
        onBack={goToCheckin}
        onRefresh={adminUsers.loadUsers}
      />

      <main className="adminUsers-container">
        <AdminUserForm
          branches={adminUsers.branches}
          form={adminUsers.createForm}
          loading={adminUsers.loading}
          msg={adminUsers.msg}
          onChange={adminUsers.updateCreateField}
          onSubmit={adminUsers.submitCreate}
        />

        <AdminUsersTable
          disableLoading={adminUsers.disableLoading}
          onEdit={adminUsers.openEditModal}
          onToggleStatus={adminUsers.toggleUserStatus}
          users={adminUsers.users}
        />
      </main>

      <AdminUserEditModal
        branches={adminUsers.branches}
        form={adminUsers.editForm}
        isEditingAdmin={adminUsers.isEditingAdmin}
        loading={adminUsers.editLoading}
        onChange={adminUsers.updateEditField}
        onClose={adminUsers.closeEditModal}
        onSubmit={adminUsers.submitEdit}
        open={adminUsers.editOpen}
      />
    </div>
  );
}
