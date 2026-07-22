import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useConfirm } from "../components/Feedback/ConfirmProvider";
import { useToast } from "../components/Feedback/ToastProvider";
import { FALLBACK_BRANCHES } from "../constants/branches";
import { getToken, getUser } from "../services/session";
import "../styles/adminUsers.css";

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

function DisableIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm0 2a7.96 7.96 0 0 1 4.9 1.7L5.7 16.9A8 8 0 0 1 12 4Zm0 16a7.96 7.96 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === "ADMIN";

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  function showToast(text, type = "success") {
    toast[type]?.(text) ?? toast.show(text, type);
  }

  useEffect(() => {
    const token = getToken();
    if (!token) return navigate("/login");
    if (!isAdmin) return navigate("/checkin");
  }, [navigate, isAdmin]);

  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState(FALLBACK_BRANCHES);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("RECEPCAO");
  const [branchId, setBranchId] = useState(String(FALLBACK_BRANCHES[0].id));

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const [editUserId, setEditUserId] = useState(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("RECEPCAO");
  const [editBranchId, setEditBranchId] = useState(
    String(FALLBACK_BRANCHES[0].id)
  );

  const [disableLoading, setDisableLoading] = useState(false);

  const isEditingAdmin = Number(editUserId) === 1;

  async function loadBranches() {
    try {
      const { data } = await api.get("/branches");
      if (Array.isArray(data) && data.length > 0) {
        setBranches(data);
        setBranchId((prev) => (prev ? prev : String(data[0].id)));
        setEditBranchId((prev) => (prev ? prev : String(data[0].id)));
      }
    } catch {
      // fallback ok
    }
  }

  async function loadUsers() {
    setMsg("");
    try {
      const { data } = await api.get("/users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Erro ao carregar usuários");
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadBranches();
    loadUsers();
  }, [isAdmin]);

  async function createUser(e) {
    e.preventDefault();
    setMsg("");

    const u = username.trim();
    if (u.length < 3)
      return showToast("Username precisa ter pelo menos 3 letras", "error");
    if (password.length < 6)
      return showToast("Senha precisa ter pelo menos 6 caracteres", "error");
    if (!branchId) return showToast("Selecione a filial", "error");

    try {
      setLoading(true);

      await api.post("/users", {
        username: u,
        password,
        role,
        branchId: Number(branchId),
      });

      setUsername("");
      setPassword("");
      setRole("RECEPCAO");
      showToast("Usuário criado com sucesso!");
      await loadUsers();
    } catch (err) {
      const m = err?.response?.data?.message || "Erro ao criar usuário";
      setMsg(m);
      showToast(m, "error");
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(u) {
    setEditUserId(u.id);
    setEditUsername(u.username || "");
    setEditPassword("");
    setEditRole(u.role || "RECEPCAO");
    setEditBranchId(String(u.branchId ?? branches?.[0]?.id ?? 1));
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editUserId) return;

    if (Number(editUserId) === 1) {
      if (!editPassword) {
        return showToast("Para o ADMIN, preencha a nova senha.", "error");
      }
      if (editPassword.length < 6) {
        return showToast("Senha precisa ter no mínimo 6 caracteres", "error");
      }

      try {
        setEditLoading(true);

        await api.put(`/users/${editUserId}`, { password: editPassword });

        showToast("Senha do ADMIN atualizada!");
        setEditOpen(false);
        setEditUserId(null);
        setEditPassword("");
        await loadUsers();
      } catch (err) {
        const m = err?.response?.data?.message || "Erro ao atualizar usuário";
        showToast(m, "error");
      } finally {
        setEditLoading(false);
      }
      return;
    }

    const newU = editUsername.trim();
    if (newU.length < 3)
      return showToast("Username precisa ter pelo menos 3 letras", "error");

    if (editPassword && editPassword.length < 6) {
      return showToast(
        "Se preencher senha, precisa ter no mínimo 6 caracteres",
        "error"
      );
    }

    try {
      setEditLoading(true);

      const body = {
        username: newU,
        role: editRole,
        branchId: Number(editBranchId),
      };
      if (editPassword) body.password = editPassword;

      await api.put(`/users/${editUserId}`, body);

      showToast("Usuário atualizado!");
      setEditOpen(false);
      setEditUserId(null);
      setEditPassword("");
      await loadUsers();
    } catch (err) {
      const m = err?.response?.data?.message || "Erro ao atualizar usuário";
      showToast(m, "error");
    } finally {
      setEditLoading(false);
    }
  }

  function submitEdit(event) {
    event.preventDefault();
    if (editLoading) return;
    saveEdit();
  }

  async function openToggleModal(u) {
    if (!u?.id) return;

    if (Number(u.id) === 1) {
      return showToast("Não é permitido alterar o ADMIN (id=1).", "error");
    }

    const approved = await confirm({
      title: u.isActive ? "Desativar usuário" : "Reativar usuário",
      message: `Tem certeza que deseja ${
        u.isActive ? "desativar" : "reativar"
      } o usuário "${u.username}" (ID ${u.id})?`,
      confirmText: u.isActive ? "Desativar" : "Reativar",
      cancelText: "Cancelar",
      type: u.isActive ? "danger" : "default",
    });

    if (!approved) return;

    try {
      setDisableLoading(true);

      if (u.isActive) {
        await api.patch(`/users/${u.id}/disable`, null);
        showToast("Usuário desativado!");
      } else {
        await api.patch(`/users/${u.id}/enable`, null);
        showToast("Usuário reativado!");
      }

      await loadUsers();
    } catch (err) {
      const m = err?.response?.data?.message || "Erro ao alterar usuário";
      showToast(m, "error");
    } finally {
      setDisableLoading(false);
    }
  }

  return (
    <div className="adminUsers-page">
      <header className="adminUsers-topbar">
        <div
          className="adminUsers-brand"
          onClick={() => navigate("/checkin")}
          role="button"
          tabIndex={0}
        >
          <img src="/logo.png" alt="Dimebras" className="adminUsers-logo" />
        </div>

        <div className="adminUsers-actions">
          <button className="au-btn au-btn-ghost" onClick={loadUsers} type="button">
            ATUALIZAR
          </button>

          <button
            className="au-btn au-btn-ghost"
            onClick={() => navigate("/checkin")}
            type="button"
          >
            VOLTAR
          </button>
        </div>
      </header>

      <main className="adminUsers-container">
        <section className="au-card">
          <div className="au-cardTitle">Criar usuário</div>

          <form className="au-form" onSubmit={createUser}>
            <div className="au-grid">
              <div className="au-field">
                <label className="au-label">Username</label>
                <input
                  className="au-input"
                  placeholder="ex: recepcao2"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="au-field">
                <label className="au-label">Senha</label>
                <input
                  className="au-input"
                  type="password"
                  placeholder="mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <div className="au-field">
                <label className="au-label">Cargo</label>
                <select
                  className="au-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="RECEPCAO">RECEPÇÃO</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="au-field">
                <label className="au-label">Filial</label>
                <select
                  className="au-input"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {msg && <div className="au-alert">{msg}</div>}

            <button
              className="au-btn au-btn-primary au-btn-full"
              type="submit"
              disabled={loading}
            >
              {loading ? "CRIANDO..." : "CRIAR USUÁRIO"}
            </button>
          </form>
        </section>

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
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className={u.isActive === false ? "au-row-disabled" : undefined}
                    >
                      <td>{u.id}</td>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>{u.branch?.name || "-"}</td>
                      <td>
                        <span className={`au-status ${u.isActive ? "is-on" : "is-off"}`}>
                          {u.isActive ? "ATIVO" : "DESATIVADO"}
                        </span>
                      </td>
                      <td>
                        {u.createdAt ? new Date(u.createdAt).toLocaleString("pt-BR") : "-"}
                      </td>
                      <td>
                        <div className="au-actions">
                          <button
                            className="au-iconBtn au-iconBtn-edit"
                            onClick={() => openEditModal(u)}
                            title="Editar usuário"
                            type="button"
                          >
                            <PencilIcon />
                          </button>

                          <button
                            className="au-iconBtn au-iconBtn-del"
                            onClick={() => openToggleModal(u)}
                            disabled={Number(u.id) === 1 || disableLoading}
                            title={u.isActive ? "Desativar usuário" : "Reativar usuário"}
                            type="button"
                          >
                            <DisableIcon />
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
          className="au-modalOverlay"
          onMouseDown={(e) => e.target === e.currentTarget && setEditOpen(false)}
        >
          <form className="au-modal" onSubmit={submitEdit}>
            <div className="au-modalTitle">Editar usuário</div>

            <label className="au-label au-modalLabel-spaced">
              Username
            </label>
            <input
              className="au-input"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              autoComplete="off"
              disabled={isEditingAdmin}
              title={isEditingAdmin ? "No ADMIN (id=1) só é permitido alterar a senha" : ""}
            />

            <label className="au-label au-modalLabel-spaced">
              Nova senha (opcional)
            </label>
            <input
              className="au-input"
              type="password"
              placeholder={isEditingAdmin ? "digite a nova senha do ADMIN" : "deixe vazio para não alterar"}
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              autoComplete="new-password"
            />

            <div className="au-modalGrid">
              <div className="au-field">
                <label className="au-label">Cargo</label>
                <select
                  className="au-input"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={isEditingAdmin}
                  title={isEditingAdmin ? "No ADMIN (id=1) só é permitido alterar a senha" : ""}
                >
                  <option value="RECEPCAO">RECEPÇÃO</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="au-field">
                <label className="au-label">Filial</label>
                <select
                  className="au-input"
                  value={editBranchId}
                  onChange={(e) => setEditBranchId(e.target.value)}
                  disabled={isEditingAdmin}
                  title={isEditingAdmin ? "No ADMIN (id=1) só é permitido alterar a senha" : ""}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="au-modalActions">
              <button
                className="au-btn au-btn-ghost"
                onClick={() => setEditOpen(false)}
                disabled={editLoading}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="au-btn au-btn-primary"
                disabled={editLoading}
                type="submit"
              >
                {editLoading ? "SALVANDO..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
