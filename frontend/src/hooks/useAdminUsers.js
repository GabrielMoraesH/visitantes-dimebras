import { useCallback, useEffect, useState } from "react";
import { FALLBACK_BRANCHES } from "../constants/branches";
import { getBranches } from "../services/branchService";
import {
  createUser,
  disableUser,
  enableUser,
  getUsers,
  updateUser,
} from "../services/userService";
import {
  ADMIN_USER_MESSAGES,
  adminUserErrorMessage,
  buildCreateUserPayload,
  buildEditUserPayload,
  editFormFromUser,
  firstBranchId,
  hasFieldErrors,
  initialCreateForm,
  isAdminUserId,
  toggleConfirmationForUser,
  validateCreateForm,
  validateEditForm,
} from "../utils/adminUsers";

export function useAdminUsers({ currentUser, enabled, confirm, showToast }) {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState(FALLBACK_BRANCHES);
  const [createForm, setCreateForm] = useState(() =>
    initialCreateForm(FALLBACK_BRANCHES)
  );
  const [createFieldErrors, setCreateFieldErrors] = useState({});
  const [createAlert, setCreateAlert] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [editFieldErrors, setEditFieldErrors] = useState({});
  const [editAlert, setEditAlert] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [statusLoadingUserId, setStatusLoadingUserId] = useState(null);
  const [statusLoadingAction, setStatusLoadingAction] = useState("");
  const [msg, setMsg] = useState("");

  const loadBranches = useCallback(async () => {
    try {
      const { data } = await getBranches();
      if (Array.isArray(data) && data.length > 0) {
        setBranches(data);
        setCreateForm((prev) => ({
          ...prev,
          branchId: prev.branchId ? prev.branchId : firstBranchId(data),
        }));
        setEditForm((prev) =>
          prev
            ? {
                ...prev,
                branchId: prev.branchId ? prev.branchId : firstBranchId(data),
              }
            : prev
        );
      }
    } catch {
      // Fallback branches keep the screen usable when this auxiliary request fails.
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setMsg("");
    setUsersLoading(true);
    try {
      const { data } = await getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg(adminUserErrorMessage(err, "load"));
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    loadBranches();
    loadUsers();
  }, [enabled, loadBranches, loadUsers]);

  function updateCreateField(field, value) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
    setCreateFieldErrors((prev) => ({ ...prev, [field]: "" }));
    setCreateAlert("");
  }

  function updateEditField(field, value) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setEditFieldErrors((prev) => ({ ...prev, [field]: "" }));
    setEditAlert("");
  }

  async function submitCreate(event) {
    event.preventDefault();
    setMsg("");
    setCreateAlert("");

    const fieldErrors = validateCreateForm(createForm);
    setCreateFieldErrors(fieldErrors);
    if (hasFieldErrors(fieldErrors)) return;

    try {
      setLoading(true);
      await createUser(buildCreateUserPayload(createForm));
      setCreateForm((prev) => ({
        ...initialCreateForm(branches),
        branchId: prev.branchId,
      }));
      setCreateFieldErrors({});
      showToast(ADMIN_USER_MESSAGES.createSuccess);
      await loadUsers();
    } catch (err) {
      setCreateAlert(adminUserErrorMessage(err, "create"));
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(user) {
    setEditForm(editFormFromUser(user, branches));
    setEditFieldErrors({});
    setEditAlert(isAdminUserId(user.id) ? ADMIN_USER_MESSAGES.protectedEdit : "");
    setEditOpen(true);
  }

  function closeEditModal() {
    setEditOpen(false);
    setEditForm(null);
    setEditFieldErrors({});
    setEditAlert("");
  }

  async function saveEdit() {
    if (!editForm?.userId) return;
    setEditAlert("");

    const fieldErrors = validateEditForm(editForm);
    setEditFieldErrors(fieldErrors);
    if (hasFieldErrors(fieldErrors)) return;

    try {
      setEditLoading(true);
      await updateUser(editForm.userId, buildEditUserPayload(editForm));

      showToast(ADMIN_USER_MESSAGES.editSuccess);
      setEditOpen(false);
      setEditForm(null);
      setEditFieldErrors({});
      setEditAlert("");
      await loadUsers();
    } catch (err) {
      setEditAlert(adminUserErrorMessage(err, "edit"));
    } finally {
      setEditLoading(false);
    }
  }

  function submitEdit(event) {
    event.preventDefault();
    if (editLoading) return;
    saveEdit();
  }

  async function toggleUserStatus(user) {
    if (!user?.id) return;
    setMsg("");

    if (isAdminUserId(user.id)) {
      setMsg(ADMIN_USER_MESSAGES.protectedDisable);
      return;
    }

    if (user.isActive && Number(currentUser?.id) === Number(user.id)) {
      setMsg(ADMIN_USER_MESSAGES.selfDisable);
      return;
    }

    const approved = await confirm(toggleConfirmationForUser(user));
    if (!approved) return;

    try {
      setStatusLoadingUserId(user.id);
      setStatusLoadingAction(user.isActive ? "deactivate" : "activate");

      if (user.isActive) {
        await disableUser(user.id);
        showToast(ADMIN_USER_MESSAGES.deactivateSuccess);
      } else {
        await enableUser(user.id);
        showToast(ADMIN_USER_MESSAGES.activateSuccess);
      }

      await loadUsers();
    } catch (err) {
      setMsg(adminUserErrorMessage(err, user.isActive ? "deactivate" : "activate"));
    } finally {
      setStatusLoadingUserId(null);
      setStatusLoadingAction("");
    }
  }

  return {
    branches,
    createAlert,
    createFieldErrors,
    createForm,
    editAlert,
    editFieldErrors,
    editForm,
    editLoading,
    editOpen,
    isEditingAdmin: isAdminUserId(editForm?.userId),
    loading,
    msg,
    statusLoadingAction,
    statusLoadingUserId,
    users,
    usersLoading,
    closeEditModal,
    loadUsers,
    openEditModal,
    submitCreate,
    submitEdit,
    toggleUserStatus,
    updateCreateField,
    updateEditField,
  };
}
