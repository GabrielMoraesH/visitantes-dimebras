import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../services/api";
import {
  createTvContent,
  deleteTvContent,
  getBranches,
  getTvContents,
  toggleTvContent,
  updateTvContent,
} from "../services/tvContentService";
import { useConfirm } from "../components/Feedback/ConfirmProvider";
import { useToast } from "../components/Feedback/ToastProvider";
import "../styles/tvContent.css";

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function getUserFromStorage() {
  const raw = localStorage.getItem("user");
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fallback to token
    }
  }

  const token = localStorage.getItem("token");
  if (!token) return null;
  const user = parseJwt(token);
  const id = Number(user?.id ?? user?.sub);
  return { ...user, id };
}

function mediaUrl(fileUrl) {
  if (!fileUrl) return "";
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${API_BASE_URL}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function branchIdsFromItem(item) {
  return Array.isArray(item?.branches) ? item.branches.map((branch) => Number(branch.id)) : [];
}

function sameBranchSet(selectedIds, branches) {
  if (!Array.isArray(branches) || branches.length === 0) return false;
  const selected = new Set(selectedIds.map((id) => Number(id)));
  return branches.every((branch) => selected.has(Number(branch.id)));
}

function BranchSelector({ branches, selectedIds, onChange }) {
  const allSelected = sameBranchSet(selectedIds, branches);

  function toggleAll(checked) {
    onChange(checked ? branches.map((branch) => branch.id) : []);
  }

  function toggleBranch(branchId, checked) {
    if (checked) {
      onChange([...new Set([...selectedIds, branchId])]);
      return;
    }

    onChange(selectedIds.filter((id) => id !== branchId));
  }

  return (
    <div className="tc-branches">
      <label className="tc-label">Exibir em</label>
      <label className="tc-check tc-all-branches">
        <input
          type="checkbox"
          checked={allSelected}
          disabled={branches.length === 0}
          onChange={(e) => toggleAll(e.target.checked)}
        />
        <span>Todas as filiais</span>
      </label>

      <div className="tc-branches-grid">
        {branches.map((branch) => (
          <label className="tc-branch-option" key={branch.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(branch.id)}
              onChange={(e) => toggleBranch(branch.id, e.target.checked)}
            />
            <span>{branch.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function BranchList({ branches, allBranches }) {
  if (sameBranchSet(branchIdsFromItem({ branches }), allBranches)) {
    return <span className="tc-branch-badge tc-branch-badge-all">Todas as filiais</span>;
  }

  if (!Array.isArray(branches) || branches.length === 0) {
    return <span className="tc-branch-list">-</span>;
  }

  return (
    <div className="tc-branch-list">
      {branches.map((branch) => (
        <span className="tc-branch-badge" key={branch.id}>
          {branch.name}
        </span>
      ))}
    </div>
  );
}

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

function ToggleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7Zm0 2a3 3 0 0 0 0 6h10a3 3 0 0 0 0-6H7Zm0 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TrashIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function TvContent() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const user = useMemo(() => getUserFromStorage(), []);
  const isAdmin = user?.role === "ADMIN";

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [order, setOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [selectedBranchIds, setSelectedBranchIds] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOrder, setEditOrder] = useState("0");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editBranchIds, setEditBranchIds] = useState([]);

  function showToast(text, type = "success") {
    toast[type]?.(text) ?? toast.show(text, type);
  }

  async function loadContents() {
    try {
      setMsg("");
      setLoading(true);
      const { data } = await getTvContents();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err?.response?.data?.message || "Erro ao carregar conteudos.";
      setMsg(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadBranches() {
    try {
      const { data } = await getBranches();
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err?.response?.data?.message || "Erro ao carregar filiais.";
      showToast(message, "error");
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, navigate]);

  async function submitUpload(event) {
    event.preventDefault();
    setMsg("");

    const cleanTitle = title.trim();
    if (!cleanTitle) return showToast("Informe o titulo da midia.", "error");
    if (!file) return showToast("Selecione um arquivo.", "error");
    if (selectedBranchIds.length === 0) {
      return showToast("Selecione pelo menos uma filial.", "error");
    }

    const formData = new FormData();
    formData.append("title", cleanTitle);
    formData.append("order", String(Number(order || 0)));
    formData.append("isActive", String(isActive));
    formData.append("branchIds", JSON.stringify(selectedBranchIds));
    formData.append("file", file);

    try {
      setUploading(true);
      await createTvContent(formData);
      setTitle("");
      setFile(null);
      setOrder("0");
      setIsActive(true);
      setSelectedBranchIds([]);
      event.target.reset();
      showToast("Midia enviada com sucesso!");
      await loadContents();
    } catch (err) {
      const message = err?.response?.data?.message || "Erro ao enviar midia.";
      setMsg(message);
      showToast(message, "error");
    } finally {
      setUploading(false);
    }
  }

  function openEdit(item) {
    setEditId(item.id);
    setEditTitle(item.title || "");
    setEditOrder(String(item.order ?? 0));
    setEditIsActive(Boolean(item.isActive));
    setEditBranchIds(branchIdsFromItem(item));
    setEditOpen(true);
  }

  async function saveEdit() {
    const cleanTitle = editTitle.trim();
    if (!cleanTitle) return showToast("Titulo nao pode ficar vazio.", "error");
    if (editBranchIds.length === 0) {
      return showToast("Selecione pelo menos uma filial.", "error");
    }

    try {
      setEditLoading(true);
      await updateTvContent(editId, {
        title: cleanTitle,
        order: Number(editOrder || 0),
        isActive: editIsActive,
        branchIds: editBranchIds,
      });
      showToast("Conteudo atualizado!");
      setEditOpen(false);
      await loadContents();
    } catch (err) {
      showToast(err?.response?.data?.message || "Erro ao atualizar conteudo.", "error");
    } finally {
      setEditLoading(false);
    }
  }

  function handleEditKeyDown(event) {
    if (event.key !== "Enter" || editLoading) return;

    event.preventDefault();
    saveEdit();
  }

  async function toggleItem(item) {
    try {
      await toggleTvContent(item.id);
      showToast(item.isActive ? "Conteudo desativado." : "Conteudo ativado.");
      await loadContents();
    } catch (err) {
      showToast(err?.response?.data?.message || "Erro ao alterar status.", "error");
    }
  }

  async function removeItem(item) {
    const approved = await confirm({
      title: "Excluir conteudo",
      message: `Deseja excluir "${item.title}"? O arquivo fisico tambem sera removido quando possivel.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      type: "danger",
    });

    if (!approved) return;

    try {
      await deleteTvContent(item.id);
      showToast("Conteudo excluido.");
      await loadContents();
    } catch (err) {
      showToast(err?.response?.data?.message || "Erro ao excluir conteudo.", "error");
    }
  }

  return (
    <div className="tvContent-page">
      <header className="tvContent-topbar">
        <div
          className="tvContent-brand"
          onClick={() => navigate("/checkin")}
          role="button"
          tabIndex={0}
        >
          <img src="/logo.png" alt="Dimebras" className="tvContent-logo" />
        </div>

        <div className="tvContent-actions">
          <button className="tc-btn tc-btn-ghost" onClick={loadContents} type="button">
            ATUALIZAR
          </button>
          <button className="tc-btn tc-btn-ghost" onClick={() => navigate("/checkin")} type="button">
            VOLTAR
          </button>
        </div>
      </header>

      <main className="tvContent-container">
        <section className="tc-card">
          <div className="tc-cardTitle">Conteudo TV</div>

          <form className="tc-form" onSubmit={submitUpload}>
            <div className="tc-grid">
              <div className="tc-field tc-field-wide">
                <label className="tc-label">Titulo da midia</label>
                <input
                  className="tc-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ex: Video institucional"
                />
              </div>

              <div className="tc-field">
                <label className="tc-label">Arquivo</label>
                <input
                  className="tc-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="tc-field">
                <label className="tc-label">Ordem</label>
                <input
                  className="tc-input"
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                />
              </div>

              <label className="tc-check">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Ativo</span>
              </label>
            </div>

            <BranchSelector
              branches={branches}
              selectedIds={selectedBranchIds}
              onChange={setSelectedBranchIds}
            />

            {msg && <div className="tc-alert">{msg}</div>}

            <div className="tc-formActions">
              <button className="tc-btn tc-btn-primary tc-btn-submit" type="submit" disabled={uploading}>
                {uploading ? "ENVIANDO..." : "ENVIAR MIDIA"}
              </button>
            </div>
          </form>
        </section>

        <section className="tc-card">
          <div className="tc-cardHeader">
            <div className="tc-cardTitle">Conteudos cadastrados</div>
            <div className="tc-pill">{items.length} total</div>
          </div>

          <div className="tc-tableWrap">
            <table className="tc-table">
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Titulo</th>
                  <th>Tipo</th>
                  <th>Tamanho</th>
                  <th>Filiais</th>
                  <th>Ordem</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th className="tc-actions-col">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="tc-empty">Carregando...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="tc-empty">Nenhum conteudo cadastrado.</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={item.isActive ? undefined : "tc-row-disabled"}>
                      <td>
                        <div className="tc-preview">
                          {item.type === "IMAGE" ? (
                            <img src={mediaUrl(item.fileUrl)} alt={item.title} />
                          ) : (
                            <video src={mediaUrl(item.fileUrl)} muted controls preload="metadata" />
                          )}
                        </div>
                      </td>
                      <td className="tc-titleCell">{item.title}</td>
                      <td>{item.type === "IMAGE" ? "Imagem" : "Video"}</td>
                      <td>{formatBytes(item.fileSize)}</td>
                      <td className="tc-branchCell">
                        <BranchList branches={item.branches} allBranches={branches} />
                      </td>
                      <td>{item.order ?? 0}</td>
                      <td>
                        <span className={`tc-status ${item.isActive ? "is-on" : "is-off"}`}>
                          {item.isActive ? "ATIVO" : "INATIVO"}
                        </span>
                      </td>
                      <td>{fmtDate(item.createdAt)}</td>
                      <td>
                        <div className="tc-actions">
                          <button
                            className="tc-iconBtn tc-iconBtn-edit"
                            onClick={() => openEdit(item)}
                            title="Editar"
                            type="button"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            className="tc-iconBtn tc-iconBtn-toggle"
                            onClick={() => toggleItem(item)}
                            title={item.isActive ? "Desativar" : "Ativar"}
                            type="button"
                          >
                            <ToggleIcon />
                          </button>
                          <button
                            className="tc-iconBtn tc-iconBtn-del"
                            onClick={() => removeItem(item)}
                            title="Excluir"
                            type="button"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {editOpen && (
        <div
          className="tc-modalOverlay"
          onMouseDown={(e) => e.target === e.currentTarget && setEditOpen(false)}
        >
          <div className="tc-modal" onKeyDown={handleEditKeyDown}>
            <div className="tc-modalTitle">Editar conteudo</div>

            <div className="tc-field tc-modalLabel-spaced">
              <label className="tc-label">Titulo</label>
              <input
                className="tc-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="tc-modalGrid">
              <div className="tc-field">
                <label className="tc-label">Ordem</label>
                <input
                  className="tc-input"
                  type="number"
                  value={editOrder}
                  onChange={(e) => setEditOrder(e.target.value)}
                />
              </div>

              <label className="tc-check tc-check-modal">
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                />
                <span>Ativo</span>
              </label>
            </div>

            <BranchSelector
              branches={branches}
              selectedIds={editBranchIds}
              onChange={setEditBranchIds}
            />

            <div className="tc-modalActions">
              <button
                className="tc-btn tc-btn-ghost"
                onClick={() => setEditOpen(false)}
                disabled={editLoading}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="tc-btn tc-btn-primary"
                onClick={saveEdit}
                disabled={editLoading}
                type="button"
              >
                {editLoading ? "SALVANDO..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
