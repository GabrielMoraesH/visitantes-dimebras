import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../services/authState";
import { setSession } from "../services/session";
import "../styles/login.css";

export default function Login() {
  const nav = useNavigate();
  const { acceptSession } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const { data } = await api.post("/auth/login", { username, password });

      setSession(data.token, data.user);
      acceptSession(data.user);

      nav("/checkin");
    } catch (err) {
      setError(err?.response?.data?.message || "Erro no login");
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <img className="login-logo" src="/logo.png" alt="Logo" />
        </div>

        <div className="login-field">
          <input
            className="login-input"
            placeholder="Usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="login-field">
          <input
            className="login-input"
            placeholder="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="login-error">{error}</p>}

        <button className="login-btn" type="submit">
          ACESSAR SISTEMA
        </button>
      </form>
    </div>
  );
}
