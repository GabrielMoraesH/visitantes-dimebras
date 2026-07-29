import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SessionSync from "./SessionSync";
import { AuthProvider } from "../services/authContext";
import { useAuth } from "../services/authState";
import { getToken, getUser, setSession } from "../services/session";
import { getCurrentUser } from "../services/auth";

vi.mock("../services/auth", () => ({
  getCurrentUser: vi.fn(),
}));

function createStorageEvent({ key, oldValue = "valor-antigo", newValue = null, storageArea = localStorage }) {
  try {
    const event = new StorageEvent("storage", {
      key,
      oldValue,
      newValue,
      storageArea,
    });

    if (event.storageArea === storageArea) return event;
  } catch {
    // jsdom versions may not fully support StorageEventInit.storageArea.
  }

  const event = new Event("storage");
  Object.defineProperties(event, {
    key: { value: key },
    oldValue: { value: oldValue },
    newValue: { value: newValue },
    storageArea: { value: storageArea },
  });
  return event;
}

function dispatchStorageEvent(options) {
  window.dispatchEvent(createStorageEvent(options));
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function AuthProbe() {
  const { status, user } = useAuth();

  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="auth-user">{user?.username || "sem-usuario"}</span>
    </div>
  );
}

function AuthSeeder() {
  const { acceptSession } = useAuth();

  useEffect(() => {
    acceptSession({ id: 1, username: "admin", role: "ADMIN" });
  }, [acceptSession]);

  return null;
}

function renderSessionSync(initialEntry = "/checkin") {
  setSession("token-teste", { id: 1, username: "admin", role: "ADMIN" });
  getCurrentUser.mockResolvedValue({ id: 1, username: "admin", role: "ADMIN" });

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SessionSync />
        <AuthSeeder />
        <Routes>
          <Route
            path="/checkin"
            element={
              <>
                <LocationProbe />
                <AuthProbe />
                <div>Checkin origem</div>
              </>
            }
          />
          <Route
            path="/login"
            element={
              <>
                <LocationProbe />
                <AuthProbe />
                <div>Login destino</div>
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe("SessionSync", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
  });

  it("redireciona para login quando outra aba remove token", async () => {
    renderSessionSync();

    dispatchStorageEvent({ key: "token", newValue: null });

    expect(await screen.findByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("auth-user")).toHaveTextContent("sem-usuario");
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("redireciona para login quando outra aba remove user", async () => {
    renderSessionSync();

    dispatchStorageEvent({ key: "user", newValue: null });

    expect(await screen.findByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("redireciona para login quando outra aba chama localStorage.clear", async () => {
    renderSessionSync();

    dispatchStorageEvent({ key: null, newValue: null });

    expect(await screen.findByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("ignora alteração comum de token com novo valor", () => {
    renderSessionSync();

    dispatchStorageEvent({ key: "token", oldValue: "token-antigo", newValue: "token-novo" });

    expect(screen.getByText("Checkin origem")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/checkin");
    expect(getToken()).toBe("token-teste");
  });

  it("ignora alteração de chave não relacionada", () => {
    renderSessionSync();

    dispatchStorageEvent({ key: "tema", oldValue: "claro", newValue: null });

    expect(screen.getByText("Checkin origem")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/checkin");
    expect(getToken()).toBe("token-teste");
  });

  it("ignora evento de outra área de storage", () => {
    renderSessionSync();

    dispatchStorageEvent({ key: "token", newValue: null, storageArea: sessionStorage });

    expect(screen.getByText("Checkin origem")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/checkin");
    expect(getToken()).toBe("token-teste");
  });

  it("estando em login, limpa estado sem redirecionamento em loop", async () => {
    renderSessionSync("/login");

    dispatchStorageEvent({ key: "token", newValue: null });

    expect(await screen.findByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
  });

  it("remove listener no unmount", () => {
    let storageHandler;
    const originalAddEventListener = window.addEventListener.bind(window);
    const addSpy = vi.spyOn(window, "addEventListener").mockImplementation((type, handler, options) => {
      if (type === "storage") storageHandler = handler;
      return originalAddEventListener(type, handler, options);
    });
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderSessionSync();
    unmount();

    expect(addSpy).toHaveBeenCalledWith("storage", storageHandler);
    expect(removeSpy).toHaveBeenCalledWith("storage", storageHandler);
  });

  it("não registra listeners duplicados em rerender", () => {
    function Wrapper() {
      const [count, setCount] = useState(0);

      return (
        <AuthProvider>
          <MemoryRouter initialEntries={["/checkin"]}>
            <SessionSync />
            <button type="button" onClick={() => setCount((current) => current + 1)}>
              rerender {count}
            </button>
          </MemoryRouter>
        </AuthProvider>
      );
    }

    const addSpy = vi.spyOn(window, "addEventListener");

    const { rerender } = render(<Wrapper />);
    rerender(<Wrapper />);

    const storageListeners = addSpy.mock.calls.filter(([type]) => type === "storage");
    expect(storageListeners).toHaveLength(1);
  });

  it("não restaura sessão quando validação pendente resolve após encerramento", async () => {
    let resolveUser;
    getCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      })
    );

    renderSessionSync();
    dispatchStorageEvent({ key: "token", newValue: null });
    resolveUser({ id: 1, username: "admin", role: "ADMIN" });

    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated"));
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});
