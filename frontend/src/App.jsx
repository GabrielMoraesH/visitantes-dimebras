import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import { ToastProvider } from "./components/Feedback/ToastProvider";
import { ConfirmProvider } from "./components/Feedback/ConfirmProvider";
import { AuthProvider } from "./services/authContext";

const Checkin = lazy(() => import("./pages/Checkin"));
const History = lazy(() => import("./pages/History"));
const VisitDetails = lazy(() => import("./pages/VisitDetails"));
const CadastroVisitante = lazy(() => import("./pages/CadastroVisitante"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Agenda = lazy(() => import("./pages/Agenda"));
const TvContent = lazy(() => import("./pages/TvContent"));
const TvDisplay = lazy(() => import("./pages/TvDisplay"));

function RouteLoading() {
  return (
    <div role="status" aria-live="polite">
      Carregando...
    </div>
  );
}

function UnknownRoute() {
  const location = useLocation();
  if (/^\/tv\d+$/.test(location.pathname)) {
    return <TvDisplay />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
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
                <Route path="*" element={<UnknownRoute />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
