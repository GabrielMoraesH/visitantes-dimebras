import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AgendaCard from "./AgendaCard";
import { ConfirmProvider } from "./Feedback/ConfirmProvider";
import { ToastProvider } from "./Feedback/ToastProvider";
import { cancelAgenda } from "../services/agendaService";

vi.mock("../services/agendaService", () => ({
  cancelAgenda: vi.fn(),
}));

const event = {
  id: 9,
  visitorName: "Maria Silva",
  company: "Dimebras",
  eventWith: "Joao Souza",
  department: "Comercial",
  eventDateTime: "2026-08-06T11:30:00",
  status: "AGENDADO",
};

function renderCard(props = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <AgendaCard
          event={props.event || event}
          isNext={false}
          onEdit={props.onEdit || vi.fn()}
          onCancel={props.onCancel || vi.fn()}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
}

describe("AgendaCard cancelamento", () => {
  it("usa confirmação padronizada antes de cancelar", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Cancelar agendamento");
    expect(screen.getByText("Tem certeza de que deseja cancelar este agendamento?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar agendamento" })).toBeInTheDocument();
  });

  it("cancela com sucesso e mostra toast único", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    cancelAgenda.mockResolvedValue({});
    renderCard({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar agendamento" }));

    await waitFor(() => expect(cancelAgenda).toHaveBeenCalledWith(9));
    expect(onCancel).toHaveBeenCalled();
    expect(await screen.findByText("Agendamento cancelado com sucesso.")).toBeInTheDocument();
    expect(screen.getAllByText("Agendamento cancelado com sucesso.")).toHaveLength(1);
  });

  it("mostra loading e mensagem acessível durante cancelamento", async () => {
    const user = userEvent.setup();
    cancelAgenda.mockImplementation(() => new Promise(() => {}));
    renderCard();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar agendamento" }));

    expect(screen.getByRole("button", { name: "Cancelando..." })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Cancelando agendamento, aguarde...");
  });

  it("mostra erro amigável ao falhar cancelamento", async () => {
    const user = userEvent.setup();
    cancelAgenda.mockRejectedValue({ response: { data: { message: "Erro interno" } } });
    renderCard();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar agendamento" }));

    expect(await screen.findByText(
      "Não foi possível cancelar o agendamento. Tente novamente em alguns instantes."
    )).toBeInTheDocument();
  });
});
