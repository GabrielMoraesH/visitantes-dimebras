import { Navigate } from "react-router-dom";
import { clearSession, getUser, isAuthenticated } from "../services/session";
import { useAuth } from "../services/authState";

function AuthFallback({ children = "Carregando sessão..." }) {
  return (
    <div role="status" aria-live="polite">
      {children}
    </div>
  );
}

export default function ProtectedRoute({ children, roles }) {
  const { status, user: validatedUser, validateSession } = useAuth();

  if (status === "validating") {
    return <AuthFallback />;
  }

  if (status === "error") {
    return (
      <div role="alert">
        Não foi possível validar a sessão.
        <button type="button" onClick={validateSession}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!isAuthenticated()) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  const user = validatedUser || getUser();

  if (roles?.length && !roles.includes(user?.role)) {
    return <Navigate to="/checkin" replace />;
  }

  return children;
}
