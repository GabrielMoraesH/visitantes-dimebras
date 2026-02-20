import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/header.css";

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
  const u = parseJwt(token);
  const id = Number(u?.id ?? u?.sub);
  return { ...u, id };
}

export default function Header({
  showQr = false,
  onQrClick,
  showHistory = true,
  showUsers = true,
  showRefresh = false,
  onRefresh,
  rightExtra, // opcional: você pode passar um botão/elemento extra
}) {
  const navigate = useNavigate();
  const user = useMemo(() => getUserFromToken(), []);
  const isAdmin = Number(user?.id) === 1;

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <header className="appHeader">
      <div
        className="appHeader-brand"
        onClick={() => navigate("/checkin")}
        role="button"
        tabIndex={0}
        title="Voltar para Check-in"
      >
        <img src="/logo.png" alt="Dimebras" className="appHeader-logo" />
      </div>

      <div className="appHeader-actions">
        {showQr && (
          <button className="appHeader-btn appHeader-btn-ghost" onClick={onQrClick} type="button">
            SAÍDA QR
          </button>
        )}

        {isAdmin && showHistory && (
          <button
            className="appHeader-btn appHeader-btn-ghost"
            onClick={() => navigate("/history")}
            type="button"
          >
            HISTÓRICO
          </button>
        )}

        {isAdmin && showUsers && (
          <button
            className="appHeader-btn appHeader-btn-ghost"
            onClick={() => navigate("/admin/users")}
            type="button"
          >
            USUÁRIOS
          </button>
        )}

        {showRefresh && (
          <button className="appHeader-btn appHeader-btn-ghost" onClick={onRefresh} type="button">
            ATUALIZAR
          </button>
        )}

        {rightExtra}

        <button className="appHeader-btn appHeader-btn-logout" onClick={logout} type="button">
          SAIR
        </button>
      </div>
    </header>
  );
}