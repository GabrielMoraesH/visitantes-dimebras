import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import Checkin from "./Checkin";
import api, { openVisitLabel } from "../services/api";
import { getToken, getUser } from "../services/session";

vi.mock("../components/Header", () => ({
  default: () => <header>Header</header>,
}));

vi.mock("../components/QrModal", () => ({
  default: () => <div>QR modal</div>,
}));

vi.mock("../components/CameraModal", () => ({
  default: ({ captureErrorMessage, captureTarget, mode, onCapture, onClose }) => (
    <div role="dialog" aria-label={`${mode}:${captureTarget}:${captureErrorMessage}`}>
      <button type="button" onClick={() => onCapture(new Blob(["foto"], { type: "image/jpeg" }))}>
        Capturar mock
      </button>
      <button type="button" onClick={onClose}>
        Fechar camera
      </button>
    </div>
  ),
}));

const toast = {
  error: vi.fn(),
  show: vi.fn(),
  success: vi.fn(),
};

vi.mock("../components/Feedback/ToastProvider", () => ({
  useToast: () => toast,
}));

const loadOpenVisitsMock = vi.fn();

vi.mock("../hooks/useOpenVisits", () => ({
  default: () => ({
    initialLoadingOpenVisits: false,
    loadOpenVisits: loadOpenVisitsMock,
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

const validCpf = "52998224725";
const validDate = "2026-08-01T10:00:00-03:00";
const expiredDate = "2025-01-01T10:00:00-03:00";

function makeVisitor(overrides = {}) {
  return {
    id: 10,
    cpf: validCpf,
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

function renderCheckin() {
  getToken.mockReturnValue("token");
  getUser.mockReturnValue({ id: 1, role: "RECEPCAO", branch: { name: "Filial 1" } });

  render(
    <MemoryRouter>
      <Checkin />
    </MemoryRouter>
  );
}

async function renderLoadedCheckin(visitor) {
  const visitorRef = { current: visitor };
  setupApi(visitorRef);
  renderCheckin();

  await userEvent.type(screen.getByPlaceholderText("Digite o CPF para iniciar..."), validCpf);
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

describe("Checkin feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it("valida CPF obrigatório e inválido antes da busca", async () => {
    renderCheckin();

    const input = screen.getByPlaceholderText("Digite o CPF para iniciar...");
    await userEvent.click(screen.getByRole("button", { name: "BUSCAR" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Informe o CPF.");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(api.get).not.toHaveBeenCalled();

    await userEvent.type(input, "11111111111");
    await userEvent.click(screen.getByRole("button", { name: "BUSCAR" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Digite um CPF válido.");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("padroniza visitante não encontrado antes de seguir para cadastro", async () => {
    api.get.mockRejectedValue({ response: { status: 404, data: { message: "Visitante não encontrado" } } });
    renderCheckin();

    await userEvent.type(screen.getByPlaceholderText("Digite o CPF para iniciar..."), validCpf);
    await userEvent.click(screen.getByRole("button", { name: "BUSCAR" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nenhum visitante foi encontrado com o CPF informado. Cadastre o visitante para continuar."
    );
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
    expect(screen.getByPlaceholderText("Falar com quem?")).toHaveAttribute("aria-invalid", "false");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /Camera mock/i })).not.toBeInTheDocument();
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

  it("consolida campos obrigatórios e documentos na mesma área", async () => {
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
      "Informe com quem o visitante veio falar.",
      "Informe o motivo da visita.",
      "A frente do documento está expirada. Fotografe-a novamente.",
      "O verso do documento está expirado. Fotografe-o novamente.",
    ]);
    expect(screen.getByPlaceholderText("Falar com quem?")).toHaveAttribute("aria-describedby", "checkin-alert-title");
    expect(screen.getByPlaceholderText("Motivo da visita?")).toHaveAttribute("aria-invalid", "true");
  });

  it("preserva dados preenchidos e não duplica toast genérico de documentos", async () => {
    await renderLoadedCheckin(makeVisitor({ documentFrontUpdatedAt: expiredDate }));

    await userEvent.type(screen.getByPlaceholderText("Falar com quem?"), "Joao");
    await userEvent.type(screen.getByPlaceholderText("Motivo da visita?"), "Entrega");
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    expect(screen.getByPlaceholderText("Falar com quem?")).toHaveValue("Joao");
    expect(screen.getByPlaceholderText("Motivo da visita?")).toHaveValue("Entrega");
    expect(toast.error).not.toHaveBeenCalled();
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
    expect(toast.success).not.toHaveBeenCalledWith("Check-in concluído! Etiqueta gerada.", "success");
  });

  it("respeita prefers-reduced-motion no scroll do alerta", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    await renderLoadedCheckin(makeVisitor({ documentFrontUpdatedAt: expiredDate }));

    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  });

  it("não trata foto antiga como pendência quando documentos estão válidos", async () => {
    await renderLoadedCheckin(makeVisitor({ photoUpdatedAt: "2024-01-01T10:00:00-03:00" }));

    await userEvent.type(screen.getByPlaceholderText("Falar com quem?"), "Joao");
    await userEvent.type(screen.getByPlaceholderText("Motivo da visita?"), "Entrega");
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(screen.queryByText(/foto/i)).not.toBeInTheDocument();
  });

  it("padroniza visita em aberto e evita termos técnicos no erro de etiqueta", async () => {
    await renderLoadedCheckin(makeVisitor());
    api.post.mockRejectedValue({
      response: { data: { code: "VISITOR_OPEN_VISIT_CONFLICT", message: "Já existe visita em andamento" } },
    });
    api.get.mockImplementation((url) => {
      if (url.startsWith("/visits/open-by-cpf/")) return Promise.resolve({ data: { id: 77 } });
      if (url.startsWith("/visitors/by-cpf/")) return Promise.resolve({ data: makeVisitor() });
      if (url.startsWith("/visits/stats-by-cpf/")) return Promise.resolve({ data: { total: 0 } });
      if (url.startsWith("/visits/recent-by-cpf/")) return Promise.resolve({ data: { items: [] } });
      return Promise.resolve({ data: {} });
    });

    await fillRequiredVisitFields();
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este visitante já possui uma visita em aberto nesta filial."
    );
    expect(screen.getByRole("button", { name: "REIMPRIMIR ETIQUETA" })).toBeInTheDocument();
    expect(screen.queryByText(/token|jwt|qr|request|stack/i)).not.toBeInTheDocument();
  });

  it("padroniza rede, erro inesperado e detalhes técnicos da API", async () => {
    await renderLoadedCheckin(makeVisitor());
    await fillRequiredVisitFields();

    api.post.mockRejectedValueOnce(new Error("Network Error"));
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );

    api.post.mockRejectedValueOnce({ response: { data: { message: "token JWT stack request" } } });
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível gerar a etiqueta. Tente novamente em alguns instantes."
    );

    api.post.mockRejectedValueOnce({
      response: { data: { details: [{ path: "documentFront", message: "documentFront buffer inválido" }] } },
    });
    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));
    expect(within(getStructuredAlert()).getByText("Fotografe a frente do documento.")).toBeInTheDocument();
    expect(screen.queryByText(/documentFront|buffer/i)).not.toBeInTheDocument();
  });

  it("expõe loading acessível durante a geração da etiqueta", async () => {
    await renderLoadedCheckin(makeVisitor());
    await fillRequiredVisitFields();

    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));

    await userEvent.click(screen.getByRole("button", { name: "GERAR ETIQUETA" }));
    expect(screen.getByRole("button", { name: "Gerando etiqueta..." })).toBeDisabled();

    resolvePost({ data: { id: 99 } });
    await waitFor(() => expect(openVisitLabel).toHaveBeenCalledWith(99));
  });

  it("abre câmera com mensagens de captura padronizadas por mídia", async () => {
    await renderLoadedCheckin(makeVisitor({ documentFrontUpdatedAt: expiredDate }));

    await userEvent.click(screen.getByRole("button", { name: "ATUALIZAR DOC (FRENTE)" }));

    expect(screen.getByRole("dialog", { name: /document:docFront:Não foi possível capturar a imagem/i })).toBeInTheDocument();
  });
});
