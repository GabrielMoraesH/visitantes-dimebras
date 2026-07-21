import { useEffect } from "react";
import { Route, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute";
import { renderWithRouter } from "../test/renderWithRouter";
import { AuthProvider } from "../services/authContext";
import { getToken, getUser, setSession as storeSession } from "../services/session";
import { getCurrentUser } from "../services/auth";

vi.mock("../services/auth", () => ({
  getCurrentUser: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function ProtectedContent({ onMount = () => {} }) {
  useEffect(() => {
    onMount();
  }, [onMount]);

  return <div>Conteudo protegido</div>;
}

function setSession(user) {
  storeSession("token-teste", user);
}

function renderProtected({ roles, path = "/private", onMount } = {}) {
  return renderWithRouter({
    initialEntries: [path],
    path,
    element: (
      <>
        <LocationProbe />
        <ProtectedRoute roles={roles}>
          <ProtectedContent onMount={onMount} />
        </ProtectedRoute>
      </>
    ),
    extraRoutes: (
      <>
        <Route
          path="/login"
          element={
            <>
              <LocationProbe />
              <div>Login destino</div>
            </>
          }
        />
        <Route
          path="/checkin"
          element={
            <>
              <LocationProbe />
              <div>Checkin destino</div>
            </>
          }
        />
      </>
    ),
  });
}

function renderProtectedWithBootstrap({ roles, path = "/private", onMount } = {}) {
  return renderWithRouter({
    initialEntries: [path],
    path,
    element: (
      <AuthProvider>
        <LocationProbe />
        <ProtectedRoute roles={roles}>
          <ProtectedContent onMount={onMount} />
        </ProtectedRoute>
      </AuthProvider>
    ),
    extraRoutes: (
      <>
        <Route path="/login" element={<div>Login destino</div>} />
        <Route path="/checkin" element={<div>Checkin destino</div>} />
      </>
    ),
  });
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
  });

  it("redireciona para login quando nao ha token", () => {
    renderProtected();

    expect(screen.getByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.queryByText("Conteudo protegido")).not.toBeInTheDocument();
  });

  it("renderiza conteudo protegido quando ha token e perfil valido", () => {
    setSession({ id: 1, username: "admin", role: "ADMIN" });

    renderProtected({ roles: ["ADMIN"] });

    expect(screen.getByText("Conteudo protegido")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/private");
  });

  it("redireciona RECEPCAO para checkin ao acessar rota ADMIN", () => {
    const onMount = vi.fn();
    setSession({ id: 2, username: "recepcao", role: "RECEPCAO" });

    renderProtected({ roles: ["ADMIN"], onMount });

    expect(screen.getByText("Checkin destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/checkin");
    expect(screen.queryByText("Conteudo protegido")).not.toBeInTheDocument();
    expect(onMount).not.toHaveBeenCalled();
  });

  it("renderiza ADMIN em rota ADMIN", () => {
    setSession({ id: 1, username: "admin", role: "ADMIN" });

    renderProtected({ roles: ["ADMIN"] });

    expect(screen.getByText("Conteudo protegido")).toBeInTheDocument();
  });

  it("limpa sessao e redireciona quando ha token sem usuario", () => {
    localStorage.setItem("token", "token-teste");

    renderProtected();

    expect(screen.getByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.queryByText("Conteudo protegido")).not.toBeInTheDocument();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("limpa sessao e redireciona quando ha user sem token", () => {
    const onMount = vi.fn();
    localStorage.setItem("user", JSON.stringify({ id: 1, username: "admin", role: "ADMIN" }));

    renderProtected({ roles: ["ADMIN"], onMount });

    expect(screen.getByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(onMount).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("limpa sessao e redireciona quando user salvo tem JSON invalido", () => {
    const onMount = vi.fn();
    localStorage.setItem("token", "token-teste");
    localStorage.setItem("user", "{");

    renderProtected({ roles: ["ADMIN"], onMount });

    expect(screen.getByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(onMount).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("aguarda bootstrap e nao monta conteudo antes da validacao", async () => {
    const onMount = vi.fn();
    let resolveUser;
    getCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      })
    );
    setSession({ id: 1, username: "admin-local", role: "ADMIN" });

    renderProtectedWithBootstrap({ roles: ["ADMIN"], onMount });

    expect(screen.getByRole("status")).toHaveTextContent("Carregando sessao...");
    expect(screen.queryByText("Conteudo protegido")).not.toBeInTheDocument();
    expect(onMount).not.toHaveBeenCalled();

    resolveUser({
      id: 1,
      username: "admin-backend",
      role: "ADMIN",
      branch: { id: 2, name: "Matriz" },
    });

    expect(await screen.findByText("Conteudo protegido")).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(getUser()).toEqual({
      id: 1,
      username: "admin-backend",
      role: "ADMIN",
      branch: { id: 2, name: "Matriz" },
    });
  });

  it("usa role atualizada pelo backend para autorizar apos bootstrap", async () => {
    const onMount = vi.fn();
    getCurrentUser.mockResolvedValue({
      id: 2,
      username: "recepcao",
      role: "RECEPCAO",
      branch: { id: 3, name: "Filial" },
    });
    setSession({ id: 2, username: "admin-local", role: "ADMIN" });

    renderProtectedWithBootstrap({ roles: ["ADMIN"], onMount });

    expect(await screen.findByText("Checkin destino")).toBeInTheDocument();
    expect(onMount).not.toHaveBeenCalled();
    expect(getUser()?.role).toBe("RECEPCAO");
    expect(getUser()?.branch).toEqual({ id: 3, name: "Filial" });
  });

  it("401 no bootstrap limpa sessao e redireciona para login", async () => {
    getCurrentUser.mockRejectedValue({ response: { status: 401 } });
    setSession({ id: 1, username: "admin", role: "ADMIN" });

    renderProtectedWithBootstrap();

    await waitFor(() => expect(screen.getByText("Login destino")).toBeInTheDocument());
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("erro temporario no bootstrap nao apaga sessao nem monta conteudo", async () => {
    const onMount = vi.fn();
    getCurrentUser.mockRejectedValue({ response: { status: 500 } });
    setSession({ id: 1, username: "admin", role: "ADMIN" });

    renderProtectedWithBootstrap({ roles: ["ADMIN"], onMount });

    expect(await screen.findByRole("alert")).toHaveTextContent("Nao foi possivel validar");
    expect(screen.queryByText("Conteudo protegido")).not.toBeInTheDocument();
    expect(onMount).not.toHaveBeenCalled();
    expect(getToken()).toBe("token-teste");
    expect(getUser()?.role).toBe("ADMIN");
  });

  it("sem sessao local completa nao chama /auth/me", () => {
    renderProtectedWithBootstrap();

    expect(screen.getByText("Login destino")).toBeInTheDocument();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
