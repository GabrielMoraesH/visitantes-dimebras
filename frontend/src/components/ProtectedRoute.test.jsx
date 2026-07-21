import { useEffect } from "react";
import { Route, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import ProtectedRoute from "./ProtectedRoute";
import { renderWithRouter } from "../test/renderWithRouter";
import { getToken, getUser, setSession as storeSession } from "../services/session";

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

describe("ProtectedRoute", () => {
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
});
