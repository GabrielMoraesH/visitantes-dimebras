import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TV_CONTENT_MESSAGES,
  tvContentActionErrorMessage,
  uploadErrorMessage,
  validateCreateTvContentFields,
  validateEditTvContentFields,
} from "../utils/tvContent";

export function useTvContentAdmin({ confirm, showToast }) {
  const navigate = useNavigate();
  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === "ADMIN";
  const editOpenerRef = useRef(null);

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [listError, setListError] = useState("");
  const [formErrors, setFormErrors] = useState([]);
  const [form, setForm] = useState(() => initialTvContentForm());
  const [editForm, setEditForm] = useState(null);
  const [editErrors, setEditErrors] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const loadContents = useCallback(async () => {
    try {
      setListError("");
      setLoading(true);
      const { data } = await getTvContents();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setListError(TV_CONTENT_MESSAGES.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const { data } = await getBranches();
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = tvContentActionErrorMessage(err, "Não foi possível carregar as filiais.");
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
    const errorField = field === "selectedBranchIds" ? "branches" : field;
    setFormErrors((prev) => prev.filter((error) => error.field !== errorField));
  }

  function updateEditField(field, value) {
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    const errorField = field === "branchIds" ? "branches" : field;
    setEditErrors((prev) => prev.filter((error) => error.field !== errorField));
  }

  async function submitUpload(event) {
    event.preventDefault();
    setMsg("");
    setFormErrors([]);

    const validationErrors = validateCreateTvContentFields(form);
    if (validationErrors.length > 0) {
      setFormErrors(validationErrors);
      return;
    }

    try {
      setUploading(true);
      await createTvContent(buildCreateTvContentFormData(form));
      setForm(initialTvContentForm());
      event.target.reset();
      showToast(TV_CONTENT_MESSAGES.createSuccess);
      await loadContents();
    } catch (err) {
      const message = uploadErrorMessage(err, TV_CONTENT_MESSAGES.unexpectedCreateError);
      setMsg(message);
    } finally {
      setUploading(false);
    }
  }

  function openEdit(item) {
    editOpenerRef.current = document.activeElement;
    setEditForm(editFormFromTvContent(item));
    setEditErrors([]);
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditForm(null);
    setEditErrors([]);
    window.setTimeout(() => editOpenerRef.current?.focus?.(), 0);
  }

  async function saveEdit() {
    if (!editForm?.id) return;

    const validationErrors = validateEditTvContentFields(editForm);
    if (validationErrors.length > 0) {
      setEditErrors(validationErrors);
      return;
    }

    try {
      setEditLoading(true);
      await updateTvContent(editForm.id, buildEditTvContentPayload(editForm));
      showToast(TV_CONTENT_MESSAGES.updateSuccess);
      setEditOpen(false);
      setEditForm(null);
      setEditErrors([]);
      window.setTimeout(() => editOpenerRef.current?.focus?.(), 0);
      await loadContents();
    } catch (err) {
      showToast(
        tvContentActionErrorMessage(err, TV_CONTENT_MESSAGES.unexpectedUpdateError),
        "error"
      );
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
      showToast(
        item.isActive
          ? TV_CONTENT_MESSAGES.deactivateSuccess
          : TV_CONTENT_MESSAGES.activateSuccess
      );
      await loadContents();
    } catch (err) {
      showToast(
        tvContentActionErrorMessage(
          err,
          item.isActive
            ? TV_CONTENT_MESSAGES.unexpectedDeactivateError
            : TV_CONTENT_MESSAGES.unexpectedActivateError
        ),
        "error"
      );
    }
  }

  async function removeItem(item) {
    const approved = await confirm(deleteConfirmationForTvContent(item));

    if (!approved) return;

    try {
      await deleteTvContent(item.id);
      showToast(TV_CONTENT_MESSAGES.deleteSuccess);
      await loadContents();
    } catch (err) {
      showToast(
        tvContentActionErrorMessage(err, TV_CONTENT_MESSAGES.unexpectedDeleteError),
        "error"
      );
    }
  }

  return {
    branches,
    editErrors,
    editForm,
    editLoading,
    editOpen,
    form,
    formErrors,
    isAdmin,
    items,
    listError,
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
