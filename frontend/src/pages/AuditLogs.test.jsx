import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AuditLogs from "./AuditLogs";
import { useAuditLogs } from "../hooks/useAuditLogs";
import { setSession } from "../services/session";

vi.mock("../hooks/useAuditLogs", () => ({
  useAuditLogs: vi.fn(),
}));

const sampleLog = {
  id: 10,
  createdAt: "2026-08-03T15:30:00.000Z",
  action: "VISITOR_CREATE",
  entity: "VISITOR",
  entityId: "55",
  description: "Criou visitante com descricao longa",
  metadata: { changedFields: ["name"] },
  ipAddress: "127.0.0.1",
  userAgent: "Vitest",
  requestId: "req-1",
  user: { id: 7, username: "admin" },
  branch: { id: 3, name: "Filial Centro" },
};

const newEventLogs = [
  ["LOGIN", "AUTH", "Login", "Autenticação", "auditBadge-neutral"],
  ["CHECKIN", "VISIT", "Check-in", "Visita", "auditBadge-success"],
  ["CHECKOUT", "VISIT", "Check-out", "Visita", "auditBadge-neutral"],
  ["VISITOR_CREATE", "VISITOR", "Visitante criado", "Visitante", "auditBadge-success"],
  ["VISITOR_UPDATE", "VISITOR", "Visitante atualizado", "Visitante", "auditBadge-info"],
  [
    "VISITOR_FILES_UPDATE",
    "VISITOR",
    "Documentos do visitante atualizados",
    "Visitante",
    "auditBadge-info",
  ],
  ["TV_CONTENT_CREATE", "TV_CONTENT", "Conteúdo de TV criado", "Conteúdo TV", "auditBadge-success"],
  ["TV_CONTENT_UPDATE", "TV_CONTENT", "Conteúdo de TV atualizado", "Conteúdo TV", "auditBadge-info"],
  ["TV_CONTENT_ACTIVATE", "TV_CONTENT", "Conteúdo de TV ativado", "Conteúdo TV", "auditBadge-success"],
  ["TV_CONTENT_DEACTIVATE", "TV_CONTENT", "Conteúdo de TV desativado", "Conteúdo TV", "auditBadge-warning"],
  ["TV_CONTENT_DELETE", "TV_CONTENT", "Conteúdo de TV excluído", "Conteúdo TV", "auditBadge-danger"],
  ["AGENDA_EVENT_CREATE", "AGENDA_EVENT", "Evento de agenda criado", "Agenda", "auditBadge-success"],
  ["AGENDA_EVENT_UPDATE", "AGENDA_EVENT", "Evento de agenda atualizado", "Agenda", "auditBadge-info"],
  ["AGENDA_EVENT_DEACTIVATE", "AGENDA_EVENT", "Evento de agenda cancelado", "Agenda", "auditBadge-warning"],
  ["USER_CREATE", "USER", "Usuário criado", "Usuário", "auditBadge-success"],
  ["USER_UPDATE", "USER", "Usuário atualizado", "Usuário", "auditBadge-info"],
  ["USER_ACTIVATE", "USER", "Usuário ativado", "Usuário", "auditBadge-success"],
  ["USER_DEACTIVATE", "USER", "Usuário desativado", "Usuário", "auditBadge-warning"],
  ["VISIT_LABEL_GENERATE", "VISIT", "Etiqueta de visita gerada", "Visita", "auditBadge-info"],
].map(([action, entity, label, entityLabel, badgeClass], index) => ({
  ...sampleLog,
  id: 100 + index,
  action,
  entity,
  entityId: String(500 + index),
  description: label,
  metadata: { flag: true },
  expectedLabel: label,
  expectedEntityLabel: entityLabel,
  expectedBadgeClass: badgeClass,
}));

function defaultHook(overrides = {}) {
  return {
    appliedFilters: {
      from: "",
      to: "",
      action: "",
      entity: "",
      userId: "",
      branchId: "",
      entityId: "",
      requestId: "",
    },
    branches: [{ id: 3, name: "Filial Centro" }],
    draftFilters: {
      from: "",
      to: "",
      action: "",
      entity: "",
      userId: "",
      branchId: "",
      entityId: "",
      requestId: "",
    },
    error: "",
    initialLoading: false,
    items: [sampleLog],
    loading: false,
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
    users: [{ id: 7, username: "admin" }],
    applyFilters: vi.fn(),
    changePageSize: vi.fn(),
    clearFilters: vi.fn(),
    loadAuditLogs: vi.fn(),
    setFilter: vi.fn(),
    setPage: vi.fn(),
    ...overrides,
  };
}

function renderPage(hook = defaultHook()) {
  setSession("token", { id: 1, username: "admin", role: "ADMIN" });
  useAuditLogs.mockReturnValue(hook);

  return render(
    <MemoryRouter>
      <AuditLogs />
    </MemoryRouter>
  );
}

describe("AuditLogs page", () => {
  it("renders loading, items, table fallbacks and no raw metadata in table", () => {
    renderPage(
      defaultHook({
        initialLoading: true,
        loading: true,
        items: [
          sampleLog,
          {
            ...sampleLog,
            id: 11,
            action: "FUTURE_ACTION",
            description: null,
            entityId: null,
            user: null,
            branch: null,
            metadata: { hidden: true },
          },
        ],
        total: 2,
      })
    );

    expect(screen.getByRole("status", { name: "Carregando registros de auditoria, aguarde..." })).toHaveTextContent(
      "Carregando auditoria..."
    );
    expect(screen.queryByText("Atualizando auditoria...")).not.toBeInTheDocument();
    expect(screen.getAllByText("03/08/2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12:30")[0]).toHaveClass("auditTime");
    expect(screen.getByText("Usuário removido")).toBeInTheDocument();
    expect(screen.getByText("Sem filial")).toBeInTheDocument();
    expect(screen.getByText("FUTURE_ACTION")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("changedFields")).not.toBeInTheDocument();
    expect(screen.queryByText("127.0.0.1")).not.toBeInTheDocument();
    expect(screen.getByText("Criou visitante com descricao longa")).toHaveAttribute("title");
    const visitorCreateBadge = screen
      .getAllByText("Visitante criado")
      .find((element) => element.classList.contains("auditBadge"));
    expect(visitorCreateBadge).toHaveAttribute("title", "Visitante criado");
    expect(screen.queryByText("VISITOR_CREATE")).not.toBeInTheDocument();
  });

  it("renders friendly labels and expected badge classes for new events", () => {
    renderPage(defaultHook({ items: newEventLogs, total: newEventLogs.length }));

    for (const log of newEventLogs) {
      const actionBadge = screen
        .getAllByText(log.expectedLabel)
        .find((element) => element.classList.contains("auditBadge"));
      expect(actionBadge).toHaveClass("auditBadge");
      expect(actionBadge).toHaveClass(log.expectedBadgeClass);
      expect(actionBadge).toHaveAttribute("title", log.expectedLabel);
    }

    expect(screen.getAllByText("Conteúdo TV").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Agenda").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Usuário").length).toBeGreaterThan(0);
  });

  it("keeps unknown action and entity fallbacks neutral", () => {
    renderPage(
      defaultHook({
        items: [
          {
            ...sampleLog,
            id: 99,
            action: "FUTURE_ACTION",
            entity: "FUTURE_ENTITY",
          },
        ],
      })
    );

    expect(screen.getByText("FUTURE_ACTION")).toHaveClass("auditBadge-neutral");
    expect(screen.getByText("FUTURE_ENTITY")).toBeInTheDocument();
  });

  it("renders empty state without filters", () => {
    renderPage(defaultHook({ items: [], total: 0, totalPages: 0 }));

    expect(screen.getByText("Nenhum registro de auditoria foi encontrado.")).toBeInTheDocument();
    expect(screen.queryByText(/Página 1 de 0|Página 0 de 0/)).not.toBeInTheDocument();
    expect(screen.getAllByText("0 registros").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("50 registros")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();
  });

  it("renders empty state with filters", () => {
    renderPage(
      defaultHook({
        appliedFilters: {
          from: "",
          to: "",
          action: "LOGIN",
          entity: "",
          userId: "",
          branchId: "",
          entityId: "",
          requestId: "",
        },
        items: [],
        total: 0,
        totalPages: 0,
      })
    );

    expect(screen.getByText("Nenhum registro de auditoria foi encontrado para os filtros informados.")).toBeInTheDocument();
  });

  it("renders API error state with retry and no empty state", async () => {
    const hook = defaultHook({
      items: [],
      total: 0,
      totalPages: 0,
      error: "Não foi possível carregar os registros de auditoria. Tente novamente.",
    });
    renderPage(hook);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os registros de auditoria. Tente novamente."
    );
    expect(screen.queryByText(/Nenhum registro de auditoria/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(hook.loadAuditLogs).toHaveBeenCalled();
  });

  it("applies filters by button and Enter, clears filters, changes pageSize and paginates", async () => {
    const hook = defaultHook({ page: 2, total: 75, totalPages: 3 });
    renderPage(hook);

    await userEvent.selectOptions(screen.getByLabelText("Ação"), "LOGIN");
    expect(hook.setFilter).toHaveBeenCalledWith("action", "LOGIN");

    await userEvent.selectOptions(screen.getByLabelText("Entidade"), "AUTH");
    await userEvent.selectOptions(screen.getByLabelText("Usuário"), "7");
    await userEvent.selectOptions(screen.getByLabelText("Filial"), "3");
    fireEvent.change(screen.getByLabelText("Identificador da entidade"), { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText("Request ID"), { target: { value: "req-1" } });
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-08-03" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-08-04" } });
    await userEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await userEvent.keyboard("{Enter}");
    await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "25");
    await userEvent.selectOptions(screen.getByLabelText("Itens por página"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await userEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    expect(hook.setFilter).toHaveBeenCalledWith("entity", "AUTH");
    expect(hook.setFilter).toHaveBeenCalledWith("userId", "7");
    expect(hook.setFilter).toHaveBeenCalledWith("branchId", "3");
    expect(hook.setFilter).toHaveBeenCalledWith("entityId", "55");
    expect(hook.setFilter).toHaveBeenCalledWith("requestId", "req-1");
    expect(hook.setFilter).toHaveBeenCalledWith("from", "2026-08-03");
    expect(hook.setFilter).toHaveBeenCalledWith("to", "2026-08-04");
    expect(hook.applyFilters).toHaveBeenCalled();
    expect(hook.changePageSize).toHaveBeenCalledWith("25");
    expect(hook.changePageSize).toHaveBeenCalledWith("100");
    expect(hook.clearFilters).toHaveBeenCalled();
    expect(hook.setPage).toHaveBeenCalledWith(1);
    expect(hook.setPage).toHaveBeenCalledWith(3);
  });

  it("shows new filter options while sending technical values", async () => {
    const hook = defaultHook();
    renderPage(hook);

    for (const label of [
      "Visitante atualizado",
      "Login",
      "Check-in",
      "Check-out",
      "Visitante criado",
      "Documentos do visitante atualizados",
      "Conteúdo de TV criado",
      "Conteúdo de TV atualizado",
      "Conteúdo de TV ativado",
      "Conteúdo de TV desativado",
      "Conteúdo de TV excluído",
      "Evento de agenda criado",
      "Evento de agenda atualizado",
      "Evento de agenda cancelado",
      "Usuário criado",
      "Usuário atualizado",
      "Usuário ativado",
      "Usuário desativado",
      "Etiqueta de visita gerada",
    ]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("option", { name: "Conteúdo TV" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Usuário" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Ação"), "AGENDA_EVENT_UPDATE");
    await userEvent.selectOptions(screen.getByLabelText("Entidade"), "AGENDA_EVENT");
    await userEvent.selectOptions(screen.getByLabelText("Ação"), "USER_DEACTIVATE");
    await userEvent.selectOptions(screen.getByLabelText("Entidade"), "USER");
    await userEvent.selectOptions(screen.getByLabelText("Ação"), "VISIT_LABEL_GENERATE");
    await userEvent.selectOptions(screen.getByLabelText("Entidade"), "VISIT");

    expect(hook.setFilter).toHaveBeenCalledWith("action", "AGENDA_EVENT_UPDATE");
    expect(hook.setFilter).toHaveBeenCalledWith("entity", "AGENDA_EVENT");
    expect(hook.setFilter).toHaveBeenCalledWith("action", "USER_DEACTIVATE");
    expect(hook.setFilter).toHaveBeenCalledWith("entity", "USER");
    expect(hook.setFilter).toHaveBeenCalledWith("action", "VISIT_LABEL_GENERATE");
    expect(hook.setFilter).toHaveBeenCalledWith("entity", "VISIT");
  });

  it("opens accessible details modal and closes by button, Escape and backdrop", async () => {
    const user = userEvent.setup();
    renderPage();
    const opener = screen.getByRole("button", { name: "Detalhes do registro de auditoria 10" });

    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Detalhes da auditoria" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("Vitest")).toBeInTheDocument();
    expect(screen.getByText(/changedFields/)).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Fechar detalhes" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Fechar detalhes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");

    await user.click(opener);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(opener);
    await user.click(screen.getByRole("dialog", { name: "Detalhes da auditoria" }));
    expect(screen.getByRole("dialog", { name: "Detalhes da auditoria" })).toBeInTheDocument();
    await user.click(document.querySelector(".auditModalBackdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("uses friendly action and entity labels in the details modal", async () => {
    const user = userEvent.setup();
    renderPage(
      defaultHook({
        items: [
          {
            ...sampleLog,
            action: "VISIT_LABEL_GENERATE",
            entity: "VISIT",
            metadata: { reprint: false },
          },
        ],
      })
    );

    await user.click(screen.getByRole("button", { name: "Detalhes do registro de auditoria 10" }));

    const dialog = screen.getByRole("dialog", { name: "Detalhes da auditoria" });
    expect(dialog).toHaveTextContent("Etiqueta de visita gerada");
    expect(dialog).toHaveTextContent("Visita");
    expect(dialog).toHaveTextContent("Data e hora");
    expect(dialog).toHaveTextContent("Endereço IP");
    expect(dialog).toHaveTextContent("Navegador / User-Agent");
    expect(screen.getByText("Metadados")).toBeInTheDocument();
    expect(dialog).toHaveTextContent('"reprint": false');
    expect(document.querySelector("[dangerouslysetinnerhtml]")).toBeNull();
  });

  it("renders standardized null values in the details modal", async () => {
    const user = userEvent.setup();
    renderPage(
      defaultHook({
        items: [
          {
            ...sampleLog,
            description: null,
            entityId: null,
            requestId: null,
            ipAddress: null,
            userAgent: null,
            metadata: null,
            user: null,
            branch: null,
          },
        ],
      })
    );

    await user.click(screen.getByRole("button", { name: "Detalhes do registro de auditoria 10" }));

    const dialog = screen.getByRole("dialog", { name: "Detalhes da auditoria" });
    expect(dialog).toHaveTextContent("Usuário removido");
    expect(dialog).toHaveTextContent("Sem filial");
    expect(screen.getByText("Sem metadados")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("does not use console logging or unsafe HTML rendering", () => {
    const logSpy = vi.spyOn(console, "log");
    renderPage();

    expect(logSpy).not.toHaveBeenCalled();
    expect(document.querySelector("[dangerouslysetinnerhtml]")).toBeNull();
  });
});
