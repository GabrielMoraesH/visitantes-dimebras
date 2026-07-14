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


export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/tv" element={<TvDisplay />} />
            <Route path="/checkin" element={<Checkin />} />
            <Route path="/history" element={<History />} />
            <Route path="/visit/:id" element={<VisitDetails />} />
            <Route path="/cadastro" element={<CadastroVisitante />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/tv-content" element={<TvContent />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
