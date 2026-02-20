import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Checkin from "./pages/Checkin";
import History from "./pages/History";
import CadastroVisitante from "./pages/CadastroVisitante";
import AdminUsers from "./pages/AdminUsers";


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/checkin" element={<Checkin />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
        <Route path="/cadastro" element={<CadastroVisitante />} />
        <Route path="/admin/users" element={<AdminUsers />} />
      </Routes>
    </BrowserRouter>
  );
}
