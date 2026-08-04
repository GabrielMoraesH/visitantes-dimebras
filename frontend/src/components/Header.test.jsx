import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "./Header";
import { getToken, getUser, setSession } from "../services/session";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderHeader(role = "ADMIN") {
  setSession("token-teste", { id: 1, username: role.toLowerCase(), role });

  return render(
    <MemoryRouter initialEntries={["/checkin"]}>
      <Routes>
        <Route
          path="/checkin"
          element={
            <>
              <LocationProbe />
              <Header />
            </>
          }
        />
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
          path="/audit"
          element={
            <>
              <LocationProbe />
              <div>Auditoria destino</div>
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("Header", () => {
  it("mantém logout existente limpando sessão e navegando para login", async () => {
    renderHeader();

    await userEvent.click(screen.getByRole("button", { name: "SAIR" }));

    expect(screen.getByText("Login destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("exibe Auditoria somente para ADMIN e navega para /audit", async () => {
    renderHeader("ADMIN");

    await userEvent.click(screen.getByRole("button", { name: "AUDITORIA" }));

    expect(screen.getByText("Auditoria destino")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/audit");
  });

  it("nao exibe Auditoria para RECEPCAO", () => {
    renderHeader("RECEPCAO");

    expect(screen.queryByRole("button", { name: "AUDITORIA" })).not.toBeInTheDocument();
  });
});
