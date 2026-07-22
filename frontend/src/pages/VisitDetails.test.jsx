import { Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VisitDetails from "./VisitDetails";
import api, { openVisitLabel } from "../services/api";
import { renderWithRouter } from "../test/renderWithRouter";

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
  },
  openVisitLabel: vi.fn(),
}));

vi.mock("../services/session", () => ({
  getToken: vi.fn(() => "token-teste"),
}));

const fullVisit = {
  id: 42,
  visitCode: "12345678",
  checkinAt: "2026-07-22T09:30:00-03:00",
  checkoutAt: "2026-07-22T11:45:00-03:00",
  branchName: "Dimebras PR",
  areaToVisit: "Compras",
  attendedBy: "Ana Souza",
  serviceType: "Reunião comercial",
  visitor: {
    id: 7,
    name: "João da Silva",
    cpf: "12345678901",
    phone: "41999998888",
    company: "Empresa Alfa",
    photoUpdatedAt: "2026-07-20T10:00:00-03:00",
    documentFrontUpdatedAt: "2026-07-20T10:00:00-03:00",
    documentBackUpdatedAt: "2026-07-20T10:00:00-03:00",
  },
  branch: { id: 1, name: "Dimebras PR" },
  checkinByUser: { id: 2, username: "recepcao.in", role: "Administrador" },
  checkoutByUser: { id: 3, username: "recepcao.out", role: "Administrador" },
};

function renderVisitDetails(visit = fullVisit) {
  api.get.mockImplementation((url) => {
    if (url === "/visits/42") return Promise.resolve({ data: visit });
    if (url === "/visitors/7/photo") return Promise.resolve({ data: new Blob(["photo"]) });
    if (url === "/visitors/7/doc-front") return Promise.resolve({ data: new Blob(["front"]) });
    if (url === "/visitors/7/doc-back") return Promise.resolve({ data: new Blob(["back"]) });
    return Promise.reject(new Error(`URL inesperada: ${url}`));
  });

  return renderWithRouter({
    element: <VisitDetails />,
    initialEntries: ["/visit/42"],
    path: "/visit/:id",
    extraRoutes: <Route path="/history" element={<div>Histórico destino</div>} />,
  });
}

describe("VisitDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi
        .fn()
        .mockReturnValueOnce("blob:photo")
        .mockReturnValueOnce("blob:front")
        .mockReturnValueOnce("blob:back"),
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renderiza dados, imagens e registros da visita em modo somente leitura", async () => {
    const { container } = renderVisitDetails();

    expect(await screen.findByAltText("Foto do visitante")).toHaveAttribute("src", "blob:photo");
    expect(screen.getByAltText("Documento frente")).toHaveAttribute("src", "blob:front");
    expect(screen.getByAltText("Documento verso")).toHaveAttribute("src", "blob:back");

    expect(screen.getByText("João da Silva")).toBeInTheDocument();
    expect(screen.getByText("123.456.789-01")).toBeInTheDocument();
    expect(screen.getByText("Empresa Alfa")).toBeInTheDocument();
    expect(screen.getByText("(41) 99999-8888")).toBeInTheDocument();
    expect(screen.getAllByText("Dimebras PR").length).toBeGreaterThan(0);
    expect(screen.getByText("Compras")).toBeInTheDocument();
    expect(screen.getByText("FALAR COM QUEM")).toBeInTheDocument();
    expect(screen.getByText("Ana Souza")).toBeInTheDocument();
    expect(screen.getByText("Reunião comercial")).toBeInTheDocument();
    expect(screen.getAllByText("22/07/2026").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.getByText("11:45")).toBeInTheDocument();
    expect(screen.getByText("REGISTRADO POR (IN)")).toBeInTheDocument();
    expect(screen.getByText("recepcao.in")).toBeInTheDocument();
    expect(screen.getByText("REGISTRADO POR (OUT)")).toBeInTheDocument();
    expect(screen.getByText("recepcao.out")).toBeInTheDocument();
    expect(screen.getByText("CÓDIGO QR CODE")).toBeInTheDocument();
    expect(screen.getByText("12345678")).toBeInTheDocument();
    expect(screen.queryByText(/administrador/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
  });

  it("exibe estados vazios e valores nulos sem checkout", async () => {
    renderVisitDetails({
      ...fullVisit,
      checkoutAt: null,
      branchName: null,
      areaToVisit: null,
      attendedBy: null,
      serviceType: null,
      visitCode: null,
      visitor: {
        id: 7,
        name: null,
        cpf: null,
        phone: null,
        company: null,
        photoUpdatedAt: null,
        documentFrontUpdatedAt: null,
        documentBackUpdatedAt: null,
      },
      branch: { id: 1, name: null },
      checkinByUser: null,
      checkoutByUser: null,
    });

    expect(await screen.findByText("Foto não disponível")).toBeInTheDocument();
    expect(screen.getAllByText("Documento não disponível")).toHaveLength(2);
    expect(screen.getAllByText("Não informado").length).toBeGreaterThanOrEqual(8);
    expect(screen.getAllByText("Em aberto").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("mantem os botoes de voltar ao historico e abrir etiqueta funcionais", async () => {
    renderVisitDetails();
    const user = userEvent.setup();

    await screen.findByText("João da Silva");

    await user.click(screen.getByRole("button", { name: /abrir etiqueta/i }));
    expect(openVisitLabel).toHaveBeenCalledWith(42);

    await user.click(screen.getByRole("button", { name: /voltar ao hist.rico/i }));
    expect(await screen.findByText("Histórico destino")).toBeInTheDocument();
  });

  it("usa classes responsivas para empilhar colunas e resumo em telas menores", async () => {
    renderVisitDetails();

    expect(await screen.findByLabelText("Detalhes da visita")).toHaveClass("vd-mainGrid");
    expect(screen.getByLabelText("Registros da visita")).toHaveClass("vd-summaryCard");
  });
});
