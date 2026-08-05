import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import Checkin from "./Checkin";
import api from "../services/api";
import { getToken, getUser } from "../services/session";

vi.mock("../components/Header", () => ({
  default: () => <header>Header</header>,
}));

vi.mock("../components/QrModal", () => ({
  default: () => <div>QR modal</div>,
}));

vi.mock("../components/CameraModal", () => ({
  default: ({ onCapture, onClose }) => (
    <div role="dialog" aria-label="Camera mock">
      <button type="button" onClick={() => onCapture(new Blob(["foto"], { type: "image/jpeg" }))}>
        Capturar mock
      </button>
      <button type="button" onClick={onClose}>
        Fechar camera
      </button>
    </div>
  ),
}));

vi.mock("../components/Feedback/ToastProvider", () => ({
  useToast: () => ({
    error: vi.fn(),
    show: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("../hooks/useOpenVisits", () => ({
  default: () => ({
    initialLoadingOpenVisits: false,
    loadOpenVisits: vi.fn(),
    loadingOpenVisits: false,
    openVisits: [],
    refreshingOpenVisits: false,
  }),
}));

vi.mock("../hooks/useVisitorMedia", () => ({
  default: () => ({
    clearAll: vi.fn(),
    clearPreview: vi.fn(),
    docBackDbUrl: "",
    docFrontDbUrl: "",
    photoSrc: "blob:photo",
    setPhotoPreviewFromBlob: vi.fn(),
  }),
}));

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  openVisitLabel: vi.fn(),
}));

vi.mock("../services/session", () => ({
  clearSession: vi.fn(),
  getToken: vi.fn(),
  getUser: vi.fn(),
}));

const validDate = "2026-08-01T10:00:00-03:00";
const expiredDate = "2025-01-01T10:00:00-03:00";

function makeVisitor(overrides = {}) {
  return {
    id: 10,
    cpf: "12345678901",
    name: "Maria Silva",
    company: "Dimebras",
    phone: "41999998888",
    photoMime: "image/jpeg",
    photoUpdatedAt: "2024-01-01T10:00:00-03:00",
    documentFrontUpdatedAt: validDate,
    documentBackUpdatedAt: validDate,
    ...overrides,
  };
}

function setupApi(visitorRef) {
  api.get.mockImplementation((url) => {
    if (url.startsWith("/visitors/by-cpf/")) return Promise.resolve({ data: { ...visitorRef.current } });
    if (url.startsWith("/visits/open-by-cpf/")) return Promise.reject({ response: { status: 404 } });
    if (url.startsWith("/visits/stats-by-cpf/")) return Promise.resolve({ data: { total: 0 } });
    if (url.startsWith("/visits/recent-by-cpf/")) return Promise.resolve({ data: { items: [] } });
    return Promise.resolve({ data: {} });
  });

  api.put.mockImplementation((url, formData) => {
    if (url === "/visitors/10/files" && formData.has("documentFront")) {
      visitorRef.current = { ...visitorRef.current, documentFrontUpdatedAt: validDate };
    }

    if (url === "/visitors/10/files" && formData.has("documentBack")) {
      visitorRef.current = { ...visitorRef.current, documentBackUpdatedAt: validDate };
    }

    return Promise.resolve({ data: {} });
  });

  api.post.mockResolvedValue({ data: { id: 99 } });
}

async function renderLoadedCheckin(visitor) {
  const visitorRef = { current: visitor };
  setupApi(visitorRef);
  getToken.mockReturnValue("token");
  getUser.mockReturnValue({ id: 1, role: "RECEPCAO", branch: { name: "Filial 1" } });

  render(
    <MemoryRouter>
      <Checkin />
    </MemoryRouter>
  );

  await userEvent.type(screen.getByPlaceholderText("Digite o CPF para iniciar..."), "12345678901");
  await userEvent.click(screen.getByRole("button", { name: "BUSCAR" }));
  expect(await screen.findByText("Maria Silva")).toBeInTheDocument();

  return visitorRef;
}

async function fillRequiredVisitFields() {
  await userEvent.type(screen.getByPlaceholderText("Falar com quem?"), "Joao");
  await userEvent.type(screen.getByPlaceholderText("Motivo da visita?"), "Entrega");
}

function getStructuredAlert() {
  return screen.getByRole("alert", { name: /corrija os campos|atualize os documentos/i });
}

describe("Checkin document feedback", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it("mostra mensagem inicial clara para frente e verso expirados sem rolar ao buscar CPF", async () => {
    await renderLoadedCheckin(
      makeVisitor({
        documentFrontUpdatedAt: expiredDate,
        documentBackUpdatedAt: expiredDate,
      })
    );

    expect(
      screen.getByText("Os documentos deste visitante estão expirados. Atualize a frente e o verso para continuar.")
    ).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("bloqueia a etiqueta com alerta estruturado, foco e ordem frente antes de verso", async () => {
    await renderLoadedCheckin(
      makeVisitor({
        documentFrontUpdatedAt: expiredDate,
        documentBackUpdatedAt: expiredDate,
      })
    );

    await fillRequiredVisitFields();
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    const alert = getStructuredAlert();
    const items = within(alert).getAllByRole("listitem").map((item) => item.textContent);

    expect(within(alert).getByText("Atualize os documentos:")).toBeInTheDocument();
    expect(items).toEqual([
      "A frente do documento está expirada. Fotografe-a novamente.",
      "O verso do documento está expirado. Fotografe-o novamente.",
    ]);
    expect(alert).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Camera mock" })).not.toBeInTheDocument();
  });

  it("lista somente a frente quando apenas a frente está expirada", async () => {
    await renderLoadedCheckin(makeVisitor({ documentFrontUpdatedAt: expiredDate }));

    await fillRequiredVisitFields();
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    const alert = getStructuredAlert();
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "A frente do documento está expirada. Fotografe-a novamente.",
    ]);
  });

  it("lista somente o verso quando apenas o verso está expirado", async () => {
    await renderLoadedCheckin(makeVisitor({ documentBackUpdatedAt: expiredDate }));

    await fillRequiredVisitFields();
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    const alert = getStructuredAlert();
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "O verso do documento está expirado. Fotografe-o novamente.",
    ]);
  });

  it("distingue documento ausente de documento expirado", async () => {
    await renderLoadedCheckin(
      makeVisitor({
        documentFrontUpdatedAt: null,
        documentBackUpdatedAt: expiredDate,
      })
    );

    await fillRequiredVisitFields();
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    const alert = getStructuredAlert();
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Fotografe a frente do documento.",
      "O verso do documento está expirado. Fotografe-o novamente.",
    ]);
  });

  it("consolida campos obrigatorios e documentos na mesma area", async () => {
    await renderLoadedCheckin(
      makeVisitor({
        documentFrontUpdatedAt: expiredDate,
        documentBackUpdatedAt: expiredDate,
      })
    );

    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    const alert = getStructuredAlert();
    expect(within(alert).getByText("Corrija os campos:")).toBeInTheDocument();
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Informe com quem veio falar.",
      "Informe o que veio fazer na empresa.",
      "A frente do documento está expirada. Fotografe-a novamente.",
      "O verso do documento está expirado. Fotografe-o novamente.",
    ]);
  });

  it("preserva dados preenchidos apos erro e nao duplica toast generico de documentos", async () => {
    await renderLoadedCheckin(makeVisitor({ documentFrontUpdatedAt: expiredDate }));

    await userEvent.type(screen.getByPlaceholderText("Falar com quem?"), "Joao");
    await userEvent.type(screen.getByPlaceholderText("Motivo da visita?"), "Entrega");
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    expect(screen.getByPlaceholderText("Falar com quem?")).toHaveValue("Joao");
    expect(screen.getByPlaceholderText("Motivo da visita?")).toHaveValue("Entrega");
    expect(screen.queryByText("Verifique os campos obrigatórios")).not.toBeInTheDocument();
  });

  it("remove somente a pendência atualizada e libera etiqueta quando os dois documentos ficam válidos", async () => {
    await renderLoadedCheckin(
      makeVisitor({
        documentFrontUpdatedAt: expiredDate,
        documentBackUpdatedAt: expiredDate,
      })
    );

    await userEvent.type(screen.getByPlaceholderText("Falar com quem?"), "Joao");
    await userEvent.type(screen.getByPlaceholderText("Motivo da visita?"), "Entrega");
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    await userEvent.click(screen.getByRole("button", { name: "ATUALIZAR DOC (FRENTE)" }));
    await userEvent.click(screen.getByRole("button", { name: "Capturar mock" }));

    await waitFor(() =>
      expect(screen.queryByText("A frente do documento está expirada. Fotografe-a novamente.")).not.toBeInTheDocument()
    );
    expect(screen.getByText("O verso do documento está expirado. Fotografe-o novamente.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ATUALIZAR DOC (VERSO)" }));
    await userEvent.click(screen.getByRole("button", { name: "Capturar mock" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/visits/checkin", expect.any(Object)));
  });

  it("respeita prefers-reduced-motion no scroll do alerta", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    await renderLoadedCheckin(makeVisitor({ documentFrontUpdatedAt: expiredDate }));

    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  });

  it("nao trata foto antiga como pendência quando documentos estão válidos", async () => {
    await renderLoadedCheckin(makeVisitor({ photoUpdatedAt: "2024-01-01T10:00:00-03:00" }));

    await userEvent.type(screen.getByPlaceholderText("Falar com quem?"), "Joao");
    await userEvent.type(screen.getByPlaceholderText("Motivo da visita?"), "Entrega");
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.queryByText(/foto/i)).not.toBeInTheDocument();
  });
});
