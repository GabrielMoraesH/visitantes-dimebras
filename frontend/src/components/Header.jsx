import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../services/session";
import "../styles/header.css";

export default function Header({
  showQr = false,
  onQrClick,
  showAgenda = true,
  showHistory = true,
  showUsers = true,
  showTvContent = true,
  showRefresh = false,
  onRefresh,
  rightExtra,
}) {
  const navigate = useNavigate();
  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === "ADMIN";

  function logout() {
    clearSession();
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

        {showAgenda && (
          <button
            className="appHeader-btn appHeader-btn-ghost"
            onClick={() => navigate("/agenda")}
            type="button"
          >
            AGENDA
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

        {isAdmin && showTvContent && (
          <button
            className="appHeader-btn appHeader-btn-ghost"
            onClick={() => navigate("/tv-content")}
            type="button"
          >
            CONTEÚDO TV
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
