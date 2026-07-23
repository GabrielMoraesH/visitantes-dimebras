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
  buildCreateUserPayload,
  buildEditUserPayload,
  editFormFromUser,
  firstBranchId,
  initialCreateForm,
  isAdminUserId,
  toggleConfirmationForUser,
  validateCreateForm,
  validateEditForm,
} from "../utils/adminUsers";

function apiMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

export function useAdminUsers({ enabled, confirm, showToast }) {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState(FALLBACK_BRANCHES);
  const [createForm, setCreateForm] = useState(() =>
    initialCreateForm(FALLBACK_BRANCHES)
  );
  const [editForm, setEditForm] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);
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
      // fallback ok
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setMsg("");
    try {
      const { data } = await getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg(apiMessage(err, "Erro ao carregar usuários"));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    loadBranches();
    loadUsers();
  }, [enabled, loadBranches, loadUsers]);

  function updateCreateField(field, value) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateEditField(field, value) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function submitCreate(event) {
    event.preventDefault();
    setMsg("");

    const validationMessage = validateCreateForm(createForm);
    if (validationMessage) {
      showToast(validationMessage, "error");
      return;
    }

    try {
      setLoading(true);
      await createUser(buildCreateUserPayload(createForm));
      setCreateForm((prev) => ({
        ...initialCreateForm(branches),
        branchId: prev.branchId,
      }));
      showToast("Usuário criado com sucesso!");
      await loadUsers();
    } catch (err) {
      const message = apiMessage(err, "Erro ao criar usuário");
      setMsg(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(user) {
    setEditForm(editFormFromUser(user, branches));
    setEditOpen(true);
  }

  function closeEditModal() {
    setEditOpen(false);
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editForm?.userId) return;

    const validationMessage = validateEditForm(editForm);
    if (validationMessage) {
      showToast(validationMessage, "error");
      return;
    }

    try {
      setEditLoading(true);
      await updateUser(editForm.userId, buildEditUserPayload(editForm));

      showToast(isAdminUserId(editForm.userId) ? "Senha do ADMIN atualizada!" : "Usuário atualizado!");
      setEditOpen(false);
      setEditForm(null);
      await loadUsers();
    } catch (err) {
      showToast(apiMessage(err, "Erro ao atualizar usuário"), "error");
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

    if (isAdminUserId(user.id)) {
      showToast("Não é permitido alterar o ADMIN (id=1).", "error");
      return;
    }

    const approved = await confirm(toggleConfirmationForUser(user));
    if (!approved) return;

    try {
      setDisableLoading(true);

      if (user.isActive) {
        await disableUser(user.id);
        showToast("Usuário desativado!");
      } else {
        await enableUser(user.id);
        showToast("Usuário reativado!");
      }

      await loadUsers();
    } catch (err) {
      showToast(apiMessage(err, "Erro ao alterar usuário"), "error");
    } finally {
      setDisableLoading(false);
    }
  }

  return {
    branches,
    createForm,
    disableLoading,
    editForm,
    editLoading,
    editOpen,
    isEditingAdmin: isAdminUserId(editForm?.userId),
    loading,
    msg,
    users,
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
