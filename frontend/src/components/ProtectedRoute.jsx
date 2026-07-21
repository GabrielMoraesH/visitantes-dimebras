import { Navigate } from "react-router-dom";
import { clearSession, getUser, isAuthenticated } from "../services/session";

export default function ProtectedRoute({ children, roles }) {
  if (!isAuthenticated()) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  const user = getUser();

  if (roles?.length && !roles.includes(user?.role)) {
    return <Navigate to="/checkin" replace />;
  }

  return children;
}
