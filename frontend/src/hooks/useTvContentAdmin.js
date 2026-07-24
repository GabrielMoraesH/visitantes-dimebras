import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getToken, getUser } from "../services/session";
import { getBranches } from "../services/branchService";
import {
  createTvContent,
  deleteTvContent,
  getTvContents,
  toggleTvContent,
  updateTvContent,
} from "../services/tvContentService";
import {
  buildCreateTvContentFormData,
  buildEditTvContentPayload,
  deleteConfirmationForTvContent,
  editFormFromTvContent,
  initialTvContentForm,
  uploadErrorMessage,
  validateCreateTvContentForm,
  validateEditTvContentForm,
} from "../utils/tvContent";

function apiMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

export function useTvContentAdmin({ confirm, showToast }) {
  const navigate = useNavigate();
  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === "ADMIN";

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(() => initialTvContentForm());
  const [editForm, setEditForm] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const loadContents = useCallback(async () => {
    try {
      setMsg("");
      setLoading(true);
      const { data } = await getTvContents();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = apiMessage(err, "Erro ao carregar conteudos.");
      setMsg(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadBranches = useCallback(async () => {
    try {
      const { data } = await getBranches();
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = apiMessage(err, "Erro ao carregar filiais.");
      showToast(message, "error");
    }
  }, [showToast]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isAdmin) {
      navigate("/checkin", { replace: true });
      return;
    }
    loadBranches();
    loadContents();
  }, [isAdmin, loadBranches, loadContents, navigate]);

  function updateFormField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateEditField(field, value) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function submitUpload(event) {
    event.preventDefault();
    setMsg("");

    const validationMessage = validateCreateTvContentForm(form);
    if (validationMessage) {
      showToast(validationMessage, "error");
      return;
    }

    try {
      setUploading(true);
      await createTvContent(buildCreateTvContentFormData(form));
      setForm(initialTvContentForm());
      event.target.reset();
      showToast("Midia enviada com sucesso!");
      await loadContents();
    } catch (err) {
      const message = uploadErrorMessage(err, "Erro ao enviar midia.");
      setMsg(message);
      showToast(message, "error");
    } finally {
      setUploading(false);
    }
  }

  function openEdit(item) {
    setEditForm(editFormFromTvContent(item));
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditForm(null);
  }

  async function saveEdit() {
    if (!editForm?.id) return;

    const validationMessage = validateEditTvContentForm(editForm);
    if (validationMessage) {
      showToast(validationMessage, "error");
      return;
    }

    try {
      setEditLoading(true);
      await updateTvContent(editForm.id, buildEditTvContentPayload(editForm));
      showToast("Conteúdo atualizado!");
      setEditOpen(false);
      setEditForm(null);
      await loadContents();
    } catch (err) {
      showToast(apiMessage(err, "Erro ao atualizar conteúdo."), "error");
    } finally {
      setEditLoading(false);
    }
  }

  function submitEdit(event) {
    event.preventDefault();
    if (editLoading) return;
    saveEdit();
  }

  async function toggleItem(item) {
    try {
      await toggleTvContent(item.id);
      showToast(item.isActive ? "Conteúdo desativado." : "Conteúdo ativado.");
      await loadContents();
    } catch (err) {
      showToast(apiMessage(err, "Erro ao alterar status."), "error");
    }
  }

  async function removeItem(item) {
    const approved = await confirm(deleteConfirmationForTvContent(item));

    if (!approved) return;

    try {
      await deleteTvContent(item.id);
      showToast("Conteúdo excluído.");
      await loadContents();
    } catch (err) {
      showToast(apiMessage(err, "Erro ao excluir conteúdo."), "error");
    }
  }

  return {
    branches,
    editForm,
    editLoading,
    editOpen,
    form,
    isAdmin,
    items,
    loading,
    msg,
    uploading,
    closeEdit,
    loadContents,
    navigate,
    openEdit,
    removeItem,
    submitEdit,
    submitUpload,
    toggleItem,
    updateEditField,
    updateFormField,
  };
}
