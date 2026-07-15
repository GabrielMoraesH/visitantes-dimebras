import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Checkin from "./pages/Checkin";
import History from "./pages/History";
import VisitDetails from "./pages/VisitDetails";
import CadastroVisitante from "./pages/CadastroVisitante";
import AdminUsers from "./pages/AdminUsers";
import Agenda from "./pages/Agenda";
import TvContent from "./pages/TvContent";
import TvDisplay from "./pages/TvDisplay";
import { ToastProvider } from "./components/Feedback/ToastProvider";
import { ConfirmProvider } from "./components/Feedback/ConfirmProvider";

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function ProtectedRoute({ children, roles }) {
  const token = localStorage.getItem("token");
  const user = getStoredUser();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (roles?.length && !roles.includes(user?.role)) {
    return <Navigate to="/checkin" replace />;
  }

  return children;
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/tv" element={<TvDisplay />} />
            <Route path="/checkin" element={<ProtectedRoute><Checkin /></ProtectedRoute>} />
            <Route
              path="/history"
              element={<ProtectedRoute roles={["ADMIN"]}><History /></ProtectedRoute>}
            />
            <Route path="/visit/:id" element={<ProtectedRoute><VisitDetails /></ProtectedRoute>} />
            <Route path="/cadastro" element={<ProtectedRoute><CadastroVisitante /></ProtectedRoute>} />
            <Route
              path="/admin/users"
              element={<ProtectedRoute roles={["ADMIN"]}><AdminUsers /></ProtectedRoute>}
            />
            <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
            <Route
              path="/tv-content"
              element={<ProtectedRoute roles={["ADMIN"]}><TvContent /></ProtectedRoute>}
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
