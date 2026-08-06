import { Route, Routes, MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./Login";
import api from "../services/api";
import { getToken, getUser, setSession } from "../services/session";

vi.mock("../services/api", () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock("../services/session", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    setSession: vi.fn(actual.setSession),
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route
          path="/login"
          element={
            <>
              <LocationProbe />
              <Login />
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
      </Routes>
    </MemoryRouter>
  );
}

async function fillLoginForm() {
  const user = userEvent.setup();

  await user.type(screen.getByPlaceholderText(/usu.rio/i), "operador");
  await user.type(screen.getByPlaceholderText(/senha/i), "senha-teste");

  return user;
}

describe("Login", () => {
  afterEach(() => {
    setSession.mockClear();
  });

  it("renderiza campos principais e botão de entrada", () => {
    renderLogin();

    expect(screen.getByPlaceholderText(/usu.rio/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/senha/i)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /acessar sistema/i })).toBeInTheDocument();
  });

  it("valida campos obrigatórios no formulário sem chamar a API", async () => {
    renderLogin();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /acessar sistema/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Informe o usuário.");
    expect(alert).toHaveTextContent("Informe a senha.");
    expect(alert).toHaveFocus();
    expect(screen.getByPlaceholderText(/usu.rio/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByPlaceholderText(/usu.rio/i)).toHaveAttribute(
      "aria-describedby",
      "login-username-error"
    );
    expect(screen.getByPlaceholderText(/senha/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByPlaceholderText(/senha/i)).toHaveAttribute(
      "aria-describedby",
      "login-password-error"
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("salva token e usuário e navega para checkin em login bem-sucedido", async () => {
    api.post.mockResolvedValue({
      data: {
        token: "token-resposta",
        user: { id: 2, username: "operador", role: "RECEPCAO", password: "não-salvar" },
      },
    });

    renderLogin();
    const user = await fillLoginForm();
    await user.click(screen.getByRole("button", { name: /acessar sistema/i }));

    await screen.findByText("Checkin destino");
    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      username: "operador",
      password: "senha-teste",
    });
    expect(setSession).toHaveBeenCalledWith("token-resposta", {
      id: 2,
      username: "operador",
      role: "RECEPCAO",
      password: "não-salvar",
    });
    expect(getToken()).toBe("token-resposta");
    expect(getUser()).toEqual({
      id: 2,
      username: "operador",
      role: "RECEPCAO",
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/checkin");
  });

  it("normaliza credenciais inválidas sem persistir sessão", async () => {
    api.post.mockRejectedValue({
      response: { status: 401, data: { message: "Credenciais inválidas" } },
    });

    renderLogin();
    const user = await fillLoginForm();
    await user.click(screen.getByRole("button", { name: /acessar sistema/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Usuário ou senha inválidos.");
    expect(alert).toHaveFocus();
    expect(screen.queryByText("Credenciais inválidas")).not.toBeInTheDocument();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(setSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("exibe usuário inativo com orientação ao administrador", async () => {
    api.post.mockRejectedValue({
      response: { status: 403, data: { code: "USER_INACTIVE", message: "Usuário inativo" } },
    });

    renderLogin();
    const user = await fillLoginForm();
    await user.click(screen.getByRole("button", { name: /acessar sistema/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Seu usuário está inativo.");
    expect(alert).toHaveTextContent("Entre em contato com um administrador.");
  });

  it("diferencia erro de rede de erro inesperado", async () => {
    api.post
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce({ response: { status: 500 } });

    renderLogin();
    const user = await fillLoginForm();
    const button = screen.getByRole("button", { name: /acessar sistema/i });

    await user.click(button);

    let alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível conectar ao servidor.");
    expect(alert).toHaveTextContent("Verifique sua conexão e tente novamente.");

    await user.click(button);

    alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível realizar o login.");
    expect(alert).toHaveTextContent("Tente novamente em alguns instantes.");
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("mantém o erro visível até nova tentativa e usa loading padronizado", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 401 } });

    renderLogin();
    const user = await fillLoginForm();
    const button = screen.getByRole("button", { name: /acessar sistema/i });

    await user.click(button);

    expect(await screen.findByText("Usuário ou senha inválidos.")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/senha/i), "x");
    expect(screen.getByText("Usuário ou senha inválidos.")).toBeInTheDocument();

    api.post.mockReturnValue(new Promise(() => {}));
    await user.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: "Entrando..." })).toBeDisabled());
  });
});
