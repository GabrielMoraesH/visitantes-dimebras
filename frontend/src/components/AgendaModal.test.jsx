import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgendaModal from "./AgendaModal";
import {
  agendaOperationErrorMessage,
  buildAgendaValidationErrors,
  orderedAgendaValidationMessages,
} from "../utils/agendaMessages";
import { ToastProvider } from "./Feedback/ToastProvider";
import { createAgenda, updateAgenda } from "../services/agendaService";

vi.mock("../services/agendaService", () => ({
  createAgenda: vi.fn(),
  updateAgenda: vi.fn(),
}));

function renderModal(props = {}) {
  return render(
    <ToastProvider>
      <AgendaModal
        event={props.event}
        onClose={props.onClose || vi.fn()}
        onSuccess={props.onSuccess || vi.fn()}
      />
    </ToastProvider>
  );
}

async function fillRequiredFields(user) {
  await user.type(screen.getByLabelText(/nome do visitante/i), "Maria Silva");
  await user.type(screen.getByLabelText(/^empresa$/i), "Dimebras");
  await user.type(screen.getByLabelText(/com quem/i), "Joao Souza");
  await user.type(screen.getByLabelText(/^setor$/i), "Comercial");
}

describe("AgendaModal mensagens e validações", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-05T10:00:00-03:00"));
    createAgenda.mockResolvedValue({ id: 1 });
    updateAgenda.mockResolvedValue({ id: 1 });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra alerta consolidado e erros inline para campos obrigatórios, sem toast", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal();

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
    expect(within(alert).getByText("Corrija os campos:")).toBeInTheDocument();

    const messages = within(alert).getAllByRole("listitem").map((item) => item.textContent);
    expect(messages).toEqual([
      "Informe o nome do visitante.",
      "Informe a empresa.",
      "Informe com quem o visitante veio falar.",
      "Informe o setor.",
      "Informe a data e o horário do agendamento.",
    ]);

    for (const message of messages) {
      expect(screen.getAllByText(message)).toHaveLength(2);
    }

    expect(screen.queryByText("Preencha todos os campos obrigatórios.")).not.toBeInTheDocument();
    expect(screen.queryByText("Campo obrigatório.")).not.toBeInTheDocument();
    expect(createAgenda).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fechar modal" })).toBeInTheDocument();
  });

  it("renderiza cabeçalho, conteúdo rolável e rodapé dentro do dialog", () => {
    const { container } = renderModal();
    const dialog = screen.getByRole("dialog", { name: "Novo Agendamento" });
    const header = container.querySelector(".agenda-modal-header");
    const content = container.querySelector(".agenda-modal-content");
    const footer = container.querySelector(".agenda-modal-actions");

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(header).toContainElement(screen.getByRole("button", { name: "Fechar modal" }));
    expect(content).toContainElement(screen.getByLabelText(/nome do visitante/i));
    expect(footer).toContainElement(screen.getByRole("button", { name: "Fechar" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "Salvar" }));
  });

  it("mantém body sem rolagem enquanto o modal está aberto e restaura ao desmontar", () => {
    document.body.style.overflow = "auto";

    const { unmount } = renderModal();

    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("auto");
  });

  it("mantém botão de fechar e rodapé acessíveis quando há vários erros", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = renderModal();

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar modal" })).toBeInTheDocument();
    expect(container.querySelector(".agenda-modal-actions")).toContainElement(
      screen.getByRole("button", { name: "Salvar" })
    );
  });

  it("leva o alerta para a área visível sem remover o fechamento", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal();

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveFocus();
    expect(alert.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(screen.getByRole("button", { name: "Fechar modal" })).toBeInTheDocument();
  });

  it("fecha pelo botão do cabeçalho e por Escape", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    const { unmount } = renderModal({ onClose });

    await user.click(screen.getByRole("button", { name: "Fechar modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    renderModal({ onClose });
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("clique interno não fecha o modal", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByLabelText(/nome do visitante/i));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("retorna foco para o elemento anterior ao desmontar", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Abrir agenda";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = renderModal();

    expect(screen.getByRole("button", { name: "Fechar modal" })).toHaveFocus();

    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("usa limite de altura, área rolável e evita rolagem horizontal no CSS", () => {
    const css = readFileSync("src/styles/agendaModal.css", "utf8");

    expect(css).toContain("max-height: calc(100vh - 32px)");
    expect(css).toContain("max-height: calc(100dvh - 32px)");
    expect(css).toContain(".agenda-modal-content");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("flex-shrink: 0");
  });

  it("mantém os textos inline iguais aos do alerta e associa aria aos campos", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal();

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(screen.getByLabelText(/nome do visitante/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/nome do visitante/i)).toHaveAttribute(
      "aria-describedby",
      "agenda-visitorName-error"
    );
    expect(screen.getByLabelText(/^data$/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^hora$/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("valida data e horário ausentes, inválidos e no passado sem criar novas regras", () => {
    expect(buildAgendaValidationErrors({
      visitorName: "Maria",
      company: "Dimebras",
      eventWith: "Joao",
      department: "Comercial",
      date: "",
      time: "",
    }).dateTime).toBe("Informe a data e o horário do agendamento.");

    expect(buildAgendaValidationErrors({
      visitorName: "Maria",
      company: "Dimebras",
      eventWith: "Joao",
      department: "Comercial",
      date: "data",
      time: "hora",
    }).dateTime).toBe("Informe uma data e um horário válidos.");

    expect(buildAgendaValidationErrors({
      visitorName: "Maria",
      company: "Dimebras",
      eventWith: "Joao",
      department: "Comercial",
      date: "2026-08-05",
      time: "09:00",
    }).dateTime).toBe("Não é possível agendar um evento no passado.");
  });

  it("preserva a ordem visual dos erros", () => {
    const errors = {
      department: "Informe o setor.",
      visitorName: "Informe o nome do visitante.",
      dateTime: "Informe a data e o horário do agendamento.",
    };

    expect(orderedAgendaValidationMessages(errors)).toEqual([
      "Informe o nome do visitante.",
      "Informe o setor.",
      "Informe a data e o horário do agendamento.",
    ]);
  });

  it("cria agendamento com sucesso mantendo payload atual", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    renderModal({ onClose, onSuccess });

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/^data$/i), "2026-08-06");
    await user.type(screen.getByLabelText(/^hora$/i), "11:30");
    await user.type(screen.getByLabelText(/observações/i), "Receber na portaria");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => {
      expect(createAgenda).toHaveBeenCalledWith({
        visitorName: "Maria Silva",
        company: "Dimebras",
        eventWith: "Joao Souza",
        department: "Comercial",
        eventDateTime: "2026-08-06T11:30:00",
        observation: "Receber na portaria",
      });
    });
    expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText("Agendamento criado com sucesso.")).toBeInTheDocument();
  });

  it("atualiza agendamento com sucesso", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal({
      event: {
        id: 7,
        visitorName: "Maria Silva",
        company: "Dimebras",
        eventWith: "Joao Souza",
        department: "Comercial",
        eventDateTime: "2026-08-06T11:30:00",
        observation: "",
      },
    });

    await user.clear(screen.getByLabelText(/^setor$/i));
    await user.type(screen.getByLabelText(/^setor$/i), "Financeiro");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(updateAgenda).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ department: "Financeiro" })
    ));
    expect(await screen.findByText("Agendamento atualizado com sucesso.")).toBeInTheDocument();
  });

  it("mostra loading específico ao criar e ao editar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createAgenda.mockImplementation(() => new Promise(() => {}));
    renderModal();

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/^data$/i), "2026-08-06");
    await user.type(screen.getByLabelText(/^hora$/i), "11:30");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(screen.getByRole("button", { name: "Criando agendamento..." })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Criando agendamento, aguarde...");
  });

  it.each([
    [{}, "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."],
    [{ response: { status: 500, data: { message: "Erro interno" } } }, "Não foi possível criar o agendamento. Tente novamente em alguns instantes."],
    [{ response: { status: 403, data: { message: "forbidden" } } }, "Você não tem permissão para alterar agendamentos desta filial."],
    [{ response: { status: 400, data: { message: "branchId inválido" } } }, "A filial selecionada não está disponível."],
  ])("sanitiza erro de criação %o", async (error, expected) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    createAgenda.mockRejectedValue(error);
    renderModal({ onClose });

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/^data$/i), "2026-08-06");
    await user.type(screen.getByLabelText(/^hora$/i), "11:30");
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.queryByRole("alert")).not.toHaveTextContent("branchId");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/nome do visitante/i)).toHaveValue("Maria Silva");
  });

  it("usa mensagem inesperada específica da edição", () => {
    expect(agendaOperationErrorMessage(
      { response: { status: 500, data: { message: "Erro interno" } } },
      true
    )).toBe("Não foi possível atualizar o agendamento. Tente novamente em alguns instantes.");
  });
});
