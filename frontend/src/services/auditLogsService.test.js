import { describe, expect, it, vi } from "vitest";
import { getAuditLogs } from "./auditLogsService";
import api from "./api";

vi.mock("./api", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("auditLogsService", () => {
  it("calls GET /audit-logs with built params", async () => {
    api.get.mockResolvedValue({ data: { items: [], pagination: {} } });

    await getAuditLogs(
      {
        action: "LOGIN",
        entity: "",
        userId: "7",
        branchId: "3",
        entityId: "",
        from: "2026-08-03",
        to: "2026-08-04",
        requestId: "req-1",
      },
      1,
      50
    );

    expect(api.get).toHaveBeenCalledWith("/audit-logs", {
      params: {
        page: 1,
        pageSize: 50,
        action: "LOGIN",
        userId: "7",
        branchId: "3",
        from: "2026-08-03",
        to: "2026-08-04",
        requestId: "req-1",
      },
    });
  });
});
