import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuditLogs } from "./useAuditLogs";
import { getAuditLogs } from "../services/auditLogsService";
import { getBranches } from "../services/branchService";
import { getUsers } from "../services/userService";

vi.mock("../services/auditLogsService", () => ({
  getAuditLogs: vi.fn(),
}));

vi.mock("../services/branchService", () => ({
  getBranches: vi.fn(),
}));

vi.mock("../services/userService", () => ({
  getUsers: vi.fn(),
}));

function Harness() {
  const audit = useAuditLogs({ enabled: true });

  return (
    <div>
      <div data-testid="state">
        {audit.loading ? "loading" : "idle"}|{audit.page}|{audit.pageSize}|{audit.total}|{audit.totalPages}
      </div>
      <div data-testid="items">{audit.items.map((item) => item.id).join(",")}</div>
      {audit.error && <div role="alert">{audit.error}</div>}
      <input
        aria-label="action"
        value={audit.draftFilters.action}
        onChange={(event) => audit.setFilter("action", event.target.value)}
      />
      <input
        aria-label="entity"
        value={audit.draftFilters.entity}
        onChange={(event) => audit.setFilter("entity", event.target.value)}
      />
      <input
        aria-label="from"
        value={audit.draftFilters.from}
        onChange={(event) => audit.setFilter("from", event.target.value)}
      />
      <input
        aria-label="to"
        value={audit.draftFilters.to}
        onChange={(event) => audit.setFilter("to", event.target.value)}
      />
      <input
        aria-label="userId"
        value={audit.draftFilters.userId}
        onChange={(event) => audit.setFilter("userId", event.target.value)}
      />
      <input
        aria-label="branchId"
        value={audit.draftFilters.branchId}
        onChange={(event) => audit.setFilter("branchId", event.target.value)}
      />
      <input
        aria-label="entityId"
        value={audit.draftFilters.entityId}
        onChange={(event) => audit.setFilter("entityId", event.target.value)}
      />
      <input
        aria-label="requestId"
        value={audit.draftFilters.requestId}
        onChange={(event) => audit.setFilter("requestId", event.target.value)}
      />
      <button type="button" onClick={audit.applyFilters}>
        apply
      </button>
      <button type="button" onClick={audit.clearFilters}>
        clear
      </button>
      <button type="button" onClick={() => audit.changePageSize(25)}>
        size25
      </button>
      <button type="button" onClick={() => audit.changePageSize(100)}>
        size100
      </button>
      <button type="button" onClick={() => audit.setPage(2)}>
        next
      </button>
    </div>
  );
}

function mockSuccess({ total = 1, totalPages = 1, page = 1, pageSize = 50, items = [{ id: 1 }] } = {}) {
  getUsers.mockResolvedValue({ data: [{ id: 7, username: "admin" }] });
  getBranches.mockResolvedValue({ data: [{ id: 3, name: "Filial" }] });
  getAuditLogs.mockImplementation((filters, requestedPage, requestedPageSize) => Promise.resolve({
    data: {
      items,
      pagination: {
        page: requestedPage || page,
        pageSize: requestedPageSize || pageSize,
        total,
        totalPages,
      },
    },
  }));
}

describe("useAuditLogs", () => {
  it("loads GET /audit-logs with defaults and auxiliary lists", async () => {
    mockSuccess();

    render(<Harness />);

    await waitFor(() => expect(getAuditLogs).toHaveBeenCalledWith(expect.any(Object), 1, 50));
    expect(getUsers).toHaveBeenCalledTimes(1);
    expect(getBranches).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state")).toHaveTextContent("idle|1|50|1|1");
    expect(screen.getByTestId("items")).toHaveTextContent("1");
  });

  it("applies all filters only after submit and resets page to 1", async () => {
    mockSuccess({ total: 100, totalPages: 4 });
    render(<Harness />);
    await waitFor(() => expect(getAuditLogs).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "next" }));
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.any(Object), 2, 50));

    await userEvent.type(screen.getByLabelText("action"), "LOGIN");
    await userEvent.type(screen.getByLabelText("entity"), "AUTH");
    await userEvent.type(screen.getByLabelText("from"), "2026-08-03");
    await userEvent.type(screen.getByLabelText("to"), "2026-08-04");
    await userEvent.type(screen.getByLabelText("userId"), "7");
    await userEvent.type(screen.getByLabelText("branchId"), "3");
    await userEvent.type(screen.getByLabelText("entityId"), "55");
    await userEvent.type(screen.getByLabelText("requestId"), "req-1");

    expect(getAuditLogs).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole("button", { name: "apply" }));

    await waitFor(() =>
      expect(getAuditLogs).toHaveBeenLastCalledWith(
        {
          action: "LOGIN",
          entity: "AUTH",
          from: "2026-08-03",
          to: "2026-08-04",
          userId: "7",
          branchId: "3",
          entityId: "55",
          requestId: "req-1",
        },
        1,
        50
      )
    );
  });

  it("supports pageSize 25/50/100 and clearing filters", async () => {
    mockSuccess({ total: 0, totalPages: 0, items: [] });
    render(<Harness />);
    await waitFor(() => expect(getAuditLogs).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "size25" }));
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.any(Object), 1, 25));

    await userEvent.click(screen.getByRole("button", { name: "size100" }));
    await waitFor(() => expect(getAuditLogs).toHaveBeenLastCalledWith(expect.any(Object), 1, 100));

    await userEvent.type(screen.getByLabelText("action"), "LOGIN");
    await userEvent.click(screen.getByRole("button", { name: "clear" }));
    await waitFor(() =>
      expect(getAuditLogs).toHaveBeenLastCalledWith(
        {
          from: "",
          to: "",
          action: "",
          entity: "",
          userId: "",
          branchId: "",
          entityId: "",
          requestId: "",
        },
        1,
        50
      )
    );
  });

  it("maps API errors without exposing raw backend details", async () => {
    getUsers.mockResolvedValue({ data: [] });
    getBranches.mockResolvedValue({ data: [] });
    getAuditLogs.mockRejectedValue({ response: { status: 400, data: { message: "ZodError stack query" } } });

    render(<Harness />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os registros de auditoria. Tente novamente."
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/ZodError|stack|query/);
  });

  it("maps network audit errors", async () => {
    getUsers.mockResolvedValue({ data: [] });
    getBranches.mockResolvedValue({ data: [] });
    getAuditLogs.mockRejectedValue(new Error("Network Error"));

    render(<Harness />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );
  });
});
