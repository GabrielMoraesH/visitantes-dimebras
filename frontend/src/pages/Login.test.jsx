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

  it("exibe mensagem de credenciais inválidas sem persistir sessão", async () => {
    api.post.mockRejectedValue({
      response: { status: 401, data: { message: "Credenciais inválidas" } },
    });

    renderLogin();
    const user = await fillLoginForm();
    await user.click(screen.getByRole("button", { name: /acessar sistema/i }));

    expect(await screen.findByText("Credenciais inválidas")).toBeInTheDocument();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(setSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("exibe mensagem padrão em falha técnica e permite nova tentativa", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 500 } });

    renderLogin();
    const user = await fillLoginForm();
    const button = screen.getByRole("button", { name: /acessar sistema/i });

    await user.click(button);

    expect(await screen.findByText("Erro no login")).toBeInTheDocument();
    expect(button).toBeEnabled();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(setSession).not.toHaveBeenCalled();
  });
});
