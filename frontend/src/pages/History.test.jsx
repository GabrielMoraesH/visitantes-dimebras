import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const emptyHistory = {
  items: [],
  page: 1,
  total: 0,
  totalPages: 1,
};

const visit = {
  id: 42,
  checkinAt: "2026-07-22T12:30:00Z",
  checkoutAt: "2026-07-22T14:45:00Z",
  attendedBy: "Ana Souza",
  branchName: "Dimebras PR",
  visitor: {
    name: "João da Silva",
    cpf: "123.456.789-01",
    company: "Empresa Alfa",
  },
  checkinByUser: { username: "recepcao.in" },
  checkoutByUser: { username: "recepcao.out" },
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function mockBranches() {
  return Promise.resolve({
    data: [
      { id: 10, name: "Filial Dinâmica" },
      { id: 11, name: "Outra Filial" },
    ],
  });
}

function renderHistory() {
  return render(
    <MemoryRouter>
      <History />
    </MemoryRouter>
  );
}

describe("History", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url === "/branches") return mockBranches();

      if (String(url).startsWith("/history?")) {
        return Promise.resolve({ data: emptyHistory });
      }

      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
  });

  it("carrega filiais dinamicamente pelo endpoint existente", async () => {
    renderHistory();

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/branches");
    });

    expect(await screen.findByRole("option", { name: "Filial: Filial Dinâmica" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Filial: Outra Filial" })).toBeInTheDocument();
  });

  it("exibe loading inicial com mensagem acessível", async () => {
    const historyRequest = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/branches") return mockBranches();
      if (String(url).startsWith("/history?")) return historyRequest.promise;
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderHistory();

    expect(screen.getByRole("status", { name: "Carregando histórico, aguarde..." })).toHaveTextContent(
      "Carregando histórico..."
    );

    historyRequest.resolve({ data: emptyHistory });
    expect(await screen.findByText("Nenhuma visita foi encontrada no histórico.")).toBeInTheDocument();
  });

  it("padroniza erro de carregamento e retry sem expor mensagem técnica", async () => {
    let historyCalls = 0;

    api.get.mockImplementation((url) => {
      if (url === "/branches") return mockBranches();
      if (String(url).startsWith("/history?")) {
        historyCalls += 1;
        if (historyCalls === 1) {
          return Promise.reject({
            response: {
              status: 500,
              data: { message: "Erro interno branchId stack" },
            },
          });
        }
        return Promise.resolve({ data: { ...emptyHistory, items: [visit], total: 1 } });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o histórico. Tente novamente em alguns instantes."
    );
    expect(screen.queryByText(/branchId|stack|Erro interno/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhuma visita foi encontrada no histórico.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("João da Silva")).toBeInTheDocument();
  });

  it("exibe estado vazio sem filtros e com filtros informados", async () => {
    renderHistory();

    expect(await screen.findByText("Nenhuma visita foi encontrada no histórico.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Filtrar por CPF"), "123.456.789-00");
    await userEvent.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(await screen.findByText("Nenhuma visita foi encontrada para os filtros informados.")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/history?cpf=12345678900&page=1&limit=10");
  });

  it("padroniza erro de rede", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/branches") return mockBranches();
      if (String(url).startsWith("/history?")) return Promise.reject({ request: {} });
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );
    expect(screen.queryByText("Erro de rede.")).not.toBeInTheDocument();
  });

  it("mantem paginação e labels com zero resultados", async () => {
    renderHistory();

    expect(await screen.findByText("0 registros - Página 1 de 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Próxima página" })).toBeDisabled();
    expect(screen.queryByText(/Página 1 de 0/)).not.toBeInTheDocument();
  });

  it("mantem paginação anterior e próxima enviando os mesmos valores", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/branches") return mockBranches();
      if (String(url).includes("page=2")) {
        return Promise.resolve({
          data: { items: [visit], page: 2, total: 11, totalPages: 2 },
        });
      }
      if (String(url).startsWith("/history?")) {
        return Promise.resolve({
          data: { items: [visit], page: 1, total: 11, totalPages: 2 },
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderHistory();

    expect(await screen.findByText("11 registros - Página 1 de 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    expect(await screen.findByText("11 registros - Página 2 de 2")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/history?page=2&limit=10");
  });

  it("renderiza dados normalmente com data e hora no timezone preservado", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/branches") return mockBranches();
      if (String(url).startsWith("/history?")) {
        return Promise.resolve({ data: { items: [visit], page: 1, total: 1, totalPages: 1 } });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderHistory();

    expect(await screen.findByText("João da Silva")).toBeInTheDocument();
    expect(screen.getAllByText("22/07/2026").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.getByText("11:45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Detalhes da visita de João da Silva" })).toBeInTheDocument();
  });
});
