import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import { ToastProvider } from "./components/Feedback/ToastProvider";
import { ConfirmProvider } from "./components/Feedback/ConfirmProvider";

const Checkin = lazy(() => import("./pages/Checkin"));
const History = lazy(() => import("./pages/History"));
const VisitDetails = lazy(() => import("./pages/VisitDetails"));
const CadastroVisitante = lazy(() => import("./pages/CadastroVisitante"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Agenda = lazy(() => import("./pages/Agenda"));
const TvContent = lazy(() => import("./pages/TvContent"));
const TvDisplay = lazy(() => import("./pages/TvDisplay"));

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

function RouteLoading() {
  return (
    <div role="status" aria-live="polite">
      Carregando...
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteLoading />}>
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
          </Suspense>
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
