import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../services/authState";
import { setSession } from "../services/session";
import "../styles/login.css";

const LOGIN_MESSAGES = {
  usernameRequired: "Informe o usuário.",
  passwordRequired: "Informe a senha.",
  invalidCredentials: "Usuário ou senha inválidos.",
  inactiveUser: "Seu usuário está inativo.\n\nEntre em contato com um administrador.",
  networkError: "Não foi possível conectar ao servidor.\n\nVerifique sua conexão e tente novamente.",
  unexpectedError: "Não foi possível realizar o login.\n\nTente novamente em alguns instantes.",
};

function getLoginErrorMessage(err) {
  if (!err?.response) return LOGIN_MESSAGES.networkError;

  const status = err.response.status;
  const code = String(err.response.data?.code || err.response.data?.error || "").toUpperCase();
  const message = String(err.response.data?.message || "");

  if (code.includes("INACTIVE") || /inativ[oa]/i.test(message)) {
    return LOGIN_MESSAGES.inactiveUser;
  }

  if (status === 400 || status === 401 || code.includes("INVALID_CREDENTIAL")) {
    return LOGIN_MESSAGES.invalidCredentials;
  }

  return LOGIN_MESSAGES.unexpectedError;
}

export default function Login() {
  const nav = useNavigate();
  const { acceptSession } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const alertRef = useRef(null);
  const usernameErrorId = "login-username-error";
  const passwordErrorId = "login-password-error";

  const alertMessages = useMemo(
    () => [fieldErrors.username, fieldErrors.password, formError].filter(Boolean),
    [fieldErrors, formError]
  );

  useEffect(() => {
    if (alertMessages.length > 0) {
      alertRef.current?.focus();
    }
  }, [alertMessages]);

  async function onSubmit(e) {
    e.preventDefault();

    const nextFieldErrors = {};
    if (!username.trim()) nextFieldErrors.username = LOGIN_MESSAGES.usernameRequired;
    if (!password) nextFieldErrors.password = LOGIN_MESSAGES.passwordRequired;

    setFieldErrors(nextFieldErrors);
    setFormError("");

    if (Object.keys(nextFieldErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      const { data } = await api.post("/auth/login", { username, password });

      setSession(data.token, data.user);
      acceptSession(data.user);

      nav("/checkin");
    } catch (err) {
      setFormError(getLoginErrorMessage(err));
    } finally {
      setIsSubmitting(false);
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
            aria-invalid={fieldErrors.username ? "true" : "false"}
            aria-describedby={fieldErrors.username ? usernameErrorId : undefined}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="login-field">
          <input
            className="login-input"
            placeholder="Senha"
            type="password"
            value={password}
            aria-invalid={fieldErrors.password ? "true" : "false"}
            aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {alertMessages.length > 0 && (
          <div
            ref={alertRef}
            className="login-error"
            role="alert"
            tabIndex={-1}
            aria-describedby="login-error-content"
          >
            <div id="login-error-content">
              {alertMessages.map((message) => (
                <p
                  key={message}
                  id={
                    message === fieldErrors.username
                      ? usernameErrorId
                      : message === fieldErrors.password
                        ? passwordErrorId
                        : undefined
                  }
                >
                  {message}
                </p>
              ))}
            </div>
          </div>
        )}

        <button className="login-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Entrando..." : "Acessar sistema"}
        </button>
      </form>
    </div>
  );
}
