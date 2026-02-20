import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import "../styles/adminUsers.css";

function authHeader() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

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

function getUserFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const user = parseJwt(token);
  const id = Number(user?.id ?? user?.sub);
  return { ...user, id };
}

const FALLBACK_BRANCHES = [
  { id: 1, name: "Dimebras PR" },
  { id: 2, name: "Dimebras MT" },
  { id: 3, name: "Dimebras MS" },
  { id: 4, name: "Dimebras SC" },
  { id: 5, name: "Alfamed MS" },
];

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

function TrashIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 7h12l-1 14H7L6 7Zm3-3h6l1 2H8l1-2Zm-4 2h14v2H5V6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const user = useMemo(() => getUserFromToken(), []);
  const isAdmin = Number(user?.id) === 1;

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // toast
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  function showToast(text, type = "success") {
    setToast({ text, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // bloqueio de acesso
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return navigate("/login");
    if (!isAdmin) return navigate("/checkin");
  }, [navigate, isAdmin]);

  // dados da tela
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState(FALLBACK_BRANCHES);

  // form create
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("RECEPCAO");
  const [branchId, setBranchId] = useState(String(FALLBACK_BRANCHES[0].id));

  // modal editar (username + senha opcional + cargo + filial)
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const [editUserId, setEditUserId] = useState(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState(""); // opcional
  const [editRole, setEditRole] = useState("RECEPCAO");
  const [editBranchId, setEditBranchId] = useState(String(FALLBACK_BRANCHES[0].id));

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  async function loadBranches() {
    try {
      const { data } = await api.get("/branches", { headers: authHeader() });
      if (Array.isArray(data) && data.length > 0) {
        setBranches(data);

        // create form
        setBranchId((prev) => (prev ? prev : String(data[0].id)));

        // se modal aberto e não tiver branch, seta a primeira
        setEditBranchId((prev) => (prev ? prev : String(data[0].id)));
      }
    } catch {
      // fallback ok
    }
  }

  async function loadUsers() {
    setMsg("");
    try {
      const { data } = await api.get("/users", { headers: authHeader() });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Erro ao carregar usuários");
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadBranches();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function createUser(e) {
    e.preventDefault();
    setMsg("");

    const u = username.trim();
    if (u.length < 3) return showToast("Username precisa ter pelo menos 3 letras", "error");
    if (password.length < 6) return showToast("Senha precisa ter pelo menos 6 caracteres", "error");
    if (!branchId) return showToast("Selecione a filial", "error");

    try {
      setLoading(true);

      await api.post(
        "/users",
        { username: u, password, role, branchId: Number(branchId) },
        { headers: authHeader() }
      );

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
    setEditPassword(""); // sempre vazio
    setEditRole(u.role || "RECEPCAO");
    setEditBranchId(String(u.branchId ?? branches?.[0]?.id ?? 1));
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editUserId) return;

    const newU = editUsername.trim();
    if (newU.length < 3) return showToast("Username precisa ter pelo menos 3 letras", "error");

    if (editPassword && editPassword.length < 6) {
      return showToast("Se preencher senha, precisa ter no mínimo 6 caracteres", "error");
    }

    try {
      setEditLoading(true);

      const body = {
        username: newU,
        role: editRole,
        branchId: Number(editBranchId),
      };
      if (editPassword) body.password = editPassword;

      await api.put(`/users/${editUserId}`, body, { headers: authHeader() });

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

  async function deleteUser(u) {
    if (!u?.id) return;

    if (Number(u.id) === 1) {
      return showToast("Não é permitido excluir o ADMIN (id=1).", "error");
    }

    const ok = window.confirm(`Excluir o usuário "${u.username}" (ID ${u.id})?`);
    if (!ok) return;

    try {
      await api.delete(`/users/${u.id}`, { headers: authHeader() });
      showToast("Usuário excluído!");
      await loadUsers();
    } catch (err) {
      const m = err?.response?.data?.message || "Erro ao excluir usuário";
      showToast(m, "error");
    }
  }

  return (
    <div className="adminUsers-page">
      {toast && (
        <div className={`adminUsers-toast ${toast.type === "error" ? "is-error" : "is-success"}`}>
          {toast.text}
        </div>
      )}

      <header className="adminUsers-topbar">
        <div className="adminUsers-brand" onClick={() => navigate("/checkin")} role="button" tabIndex={0}>
          <img src="/logo.png" alt="Dimebras" className="adminUsers-logo" />
        </div>

        <div className="adminUsers-actions">
          <button className="au-btn au-btn-ghost" onClick={loadUsers} type="button">
            ATUALIZAR
          </button>

          <button className="au-btn au-btn-ghost" onClick={() => navigate("/checkin")} type="button">
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
                <select className="au-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="RECEPCAO">RECEPÇÃO</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="au-field">
                <label className="au-label">Filial</label>
                <select className="au-input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {msg && <div className="au-alert">{msg}</div>}

            <button className="au-btn au-btn-primary au-btn-full" type="submit" disabled={loading}>
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
                  <th>Criado em</th>
                  <th style={{ width: 140 }}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="au-empty">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>{u.branch?.name || "-"}</td>
                      <td>{u.createdAt ? new Date(u.createdAt).toLocaleString("pt-BR") : "-"}</td>
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
                            onClick={() => deleteUser(u)}
                            disabled={Number(u.id) === 1}
                            title={Number(u.id) === 1 ? "Não é permitido excluir o admin" : "Excluir usuário"}
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
        <div className="au-modalOverlay" onMouseDown={(e) => e.target === e.currentTarget && setEditOpen(false)}>
          <div className="au-modal">
            <div className="au-modalTitle">Editar usuário</div>

            <label className="au-label" style={{ marginTop: 10 }}>
              Username
            </label>
            <input
              className="au-input"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              autoComplete="off"
            />

            <label className="au-label" style={{ marginTop: 10 }}>
              Nova senha (opcional)
            </label>
            <input
              className="au-input"
              type="password"
              placeholder="deixe vazio para não alterar"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              autoComplete="new-password"
            />

            <div className="au-modalGrid">
              <div className="au-field">
                <label className="au-label">Cargo</label>
                <select className="au-input" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  <option value="RECEPCAO">RECEPÇÃO</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="au-field">
                <label className="au-label">Filial</label>
                <select className="au-input" value={editBranchId} onChange={(e) => setEditBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="au-modalActions">
              <button className="au-btn au-btn-ghost" onClick={() => setEditOpen(false)} disabled={editLoading}>
                Cancelar
              </button>
              <button className="au-btn au-btn-primary" onClick={saveEdit} disabled={editLoading}>
                {editLoading ? "SALVANDO..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}