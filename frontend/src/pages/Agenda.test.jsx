import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Agenda from "./Agenda";
import { ConfirmProvider } from "../components/Feedback/ConfirmProvider";
import { ToastProvider } from "../components/Feedback/ToastProvider";
import { getAgenda } from "../services/agendaService";

vi.mock("../services/agendaService", () => ({
  getAgenda: vi.fn(),
}));

function renderAgenda() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <Agenda />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("Agenda página", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-05T10:00:00-03:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra loading acessível da lista", () => {
    getAgenda.mockImplementation(() => new Promise(() => {}));
    renderAgenda();

    expect(screen.getByRole("status")).toHaveTextContent("Carregando agenda...");
    expect(screen.getByRole("status")).toHaveTextContent("Carregando agenda, aguarde...");
  });

  it("mostra erro de carregamento amigável e preserva retry", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    getAgenda
      .mockRejectedValueOnce({ response: { data: { message: "Falha na requisição" } } })
      .mockResolvedValueOnce([]);

    renderAgenda();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar a agenda.");
    expect(alert).toHaveTextContent("Tente novamente.");
    expect(alert).not.toHaveTextContent("Falha na requisição");

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(getAgenda).toHaveBeenCalledTimes(2));
  });

  it("mostra estado vazio sem filtros", async () => {
    getAgenda.mockResolvedValue([]);
    renderAgenda();

    expect(await screen.findByText("Nenhum agendamento encontrado.")).toBeInTheDocument();
    expect(screen.getByText("Crie um agendamento para começar.")).toBeInTheDocument();
  });

  it("mostra estado vazio para filtro aplicado no período", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    getAgenda.mockResolvedValue([
      {
        id: 2,
        visitorName: "Maria Silva",
        company: "Dimebras",
        eventWith: "Joao Souza",
        department: "Comercial",
        eventDateTime: "2026-08-05T11:30:00",
        status: "AGENDADO",
      },
    ]);
    renderAgenda();

    expect(await screen.findByText("Maria Silva")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/buscar visitante/i), "sem resultado");

    expect(screen.getByText("Nenhum agendamento foi encontrado para o período informado.")).toBeInTheDocument();
  });
});
