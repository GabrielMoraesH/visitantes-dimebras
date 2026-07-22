import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import History from "./History";
import { api } from "../services/api";

vi.mock("../services/session", () => ({
  getUser: () => ({ role: "ADMIN" }),
}));

vi.mock("../services/api", () => {
  const apiMock = {
    get: vi.fn(),
  };

  return {
    api: apiMock,
    default: apiMock,
  };
});

describe("History", () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === "/branches") {
        return Promise.resolve({
          data: [
            { id: 10, name: "Filial Dinâmica" },
            { id: 11, name: "Outra Filial" },
          ],
        });
      }

      if (String(url).startsWith("/history?")) {
        return Promise.resolve({
          data: {
            items: [],
            page: 1,
            total: 0,
            totalPages: 1,
          },
        });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
  });

  it("carrega filiais dinamicamente pelo endpoint existente", async () => {
    render(
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/branches");
    });

    expect(await screen.findByRole("option", { name: "Filial: Filial Dinâmica" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Filial: Outra Filial" })).toBeInTheDocument();
  });
});
