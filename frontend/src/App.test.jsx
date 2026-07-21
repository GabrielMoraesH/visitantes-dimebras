import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

const lazyMocks = vi.hoisted(() => {
  let resolveCheckin;
  let resolveAdminUsers;

  return {
    adminUsersMounted: vi.fn(),
    checkin: new Promise((resolve) => {
      resolveCheckin = resolve;
    }),
    adminUsers: new Promise((resolve) => {
      resolveAdminUsers = resolve;
    }),
    resolveCheckin: (module) => resolveCheckin(module),
    resolveAdminUsers: (module) => resolveAdminUsers(module),
  };
});

vi.mock("./pages/Login", () => ({
  default: () => <div>Login mock</div>,
}));

vi.mock("./pages/Checkin", () => lazyMocks.checkin);
vi.mock("./pages/AdminUsers", () => lazyMocks.adminUsers);

vi.mock("./pages/TvDisplay", () => ({
  default: () => <div>TV publica mock</div>,
}));

vi.mock("./pages/History", () => ({
  default: () => <div>History mock</div>,
}));

vi.mock("./pages/VisitDetails", () => ({
  default: () => <div>Visit details mock</div>,
}));

vi.mock("./pages/CadastroVisitante", () => ({
  default: () => <div>Cadastro mock</div>,
}));

vi.mock("./pages/Agenda", () => ({
  default: () => <div>Agenda mock</div>,
}));

vi.mock("./pages/TvContent", () => ({
  default: () => <div>TV content mock</div>,
}));

function CheckinMock() {
  const location = useLocation();

  return (
    <div>
      Checkin lazy mock
      <span data-testid="checkin-path">{location.pathname}</span>
      <span data-testid="checkin-search">{location.search}</span>
    </div>
  );
}

function AdminUsersMock() {
  useEffect(() => {
    lazyMocks.adminUsersMounted();
  }, []);

  return <div>Admin users lazy mock</div>;
}

function setSession(role) {
  localStorage.setItem("token", "token-teste");
  localStorage.setItem("user", JSON.stringify({ id: 1, username: role.toLowerCase(), role }));
}

function renderAppAt(path) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

describe("App routes and lazy loading", () => {
  it("exibe fallback acessivel e preserva query string em rota lazy comum", async () => {
    setSession("RECEPCAO");

    renderAppAt("/checkin?cpf=12345678901");

    const fallback = screen.getByRole("status");
    expect(fallback).toHaveTextContent("Carregando...");
    expect(fallback).toHaveAttribute("aria-live", "polite");

    lazyMocks.resolveCheckin({ default: CheckinMock });

    expect(await screen.findByText("Checkin lazy mock")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("checkin-path")).toHaveTextContent("/checkin");
    expect(screen.getByTestId("checkin-search")).toHaveTextContent("?cpf=12345678901");
  });

  it("carrega rota ADMIN lazy para ADMIN autorizado", async () => {
    setSession("ADMIN");

    renderAppAt("/admin/users");

    expect(screen.getByRole("status")).toHaveTextContent("Carregando...");
    lazyMocks.resolveAdminUsers({ default: AdminUsersMock });

    expect(await screen.findByText("Admin users lazy mock")).toBeInTheDocument();
    expect(lazyMocks.adminUsersMounted).toHaveBeenCalledTimes(1);
  });

  it("bloqueia RECEPCAO em rota ADMIN sem montar conteudo ADMIN", async () => {
    setSession("RECEPCAO");

    renderAppAt("/admin/users");

    await waitFor(() => expect(window.location.pathname).toBe("/checkin"));
    expect(screen.queryByText("Admin users lazy mock")).not.toBeInTheDocument();
    expect(lazyMocks.adminUsersMounted).not.toHaveBeenCalled();
  });

  it("mantem login publico acessivel sem token", () => {
    renderAppAt("/login");

    expect(screen.getByText("Login mock")).toBeInTheDocument();
  });

  it("mantem TV publica acessivel sem token", async () => {
    renderAppAt("/tv");

    expect(await screen.findByText("TV publica mock")).toBeInTheDocument();
  });

  it("redireciona rota desconhecida para login", async () => {
    renderAppAt("/rota-inexistente");

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(screen.getByText("Login mock")).toBeInTheDocument();
  });
});
