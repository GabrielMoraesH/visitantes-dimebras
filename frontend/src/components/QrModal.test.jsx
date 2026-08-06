import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QrModal from "./QrModal";
import api from "../services/api";

const scannerMock = vi.hoisted(() => ({
  clear: vi.fn(() => Promise.resolve()),
  constructor: vi.fn(),
  failureCallback: null,
  start: vi.fn((_camera, _config, successCallback, failureCallback) => {
    scannerMock.successCallback = successCallback;
    scannerMock.failureCallback = failureCallback;
    return Promise.resolve();
  }),
  stop: vi.fn(() => Promise.resolve()),
  successCallback: null,
}));

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: vi.fn(function Html5Qrcode() {
    scannerMock.constructor();
    return {
      clear: scannerMock.clear,
      start: scannerMock.start,
      stop: scannerMock.stop,
    };
  }),
}));

vi.mock("../services/api", () => ({
  default: {
    post: vi.fn(),
  },
}));

function setCameraSupport(supported = true) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: supported ? { getUserMedia: vi.fn() } : undefined,
  });
}

function renderModal(props = {}) {
  const callbacks = {
    onCheckoutDone: vi.fn(),
    onClose: vi.fn(),
    onToast: vi.fn(),
    ...props,
  };

  const rendered = render(<QrModal {...callbacks} />);

  return { ...callbacks, ...rendered };
}

describe("QrModal checkout feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scannerMock.failureCallback = null;
    scannerMock.successCallback = null;
    scannerMock.start.mockImplementation((_camera, _config, successCallback, failureCallback) => {
      scannerMock.successCallback = successCallback;
      scannerMock.failureCallback = failureCallback;
      return Promise.resolve();
    });
    scannerMock.stop.mockResolvedValue();
    scannerMock.clear.mockResolvedValue();
    setCameraSupport(true);
  });

  it("abre em estado neutro sem alerta, validação manual ou foco de erro", async () => {
    renderModal();

    await waitFor(() => expect(scannerMock.start).toHaveBeenCalled());

    const input = screen.getByLabelText("Código da etiqueta");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Não foi possível ler o QR Code.")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveFocus();
  });

  it("mantém frames sem QR silenciosos e scanner ativo", async () => {
    renderModal();
    await waitFor(() => expect(scannerMock.start).toHaveBeenCalled());

    const closeButton = screen.getByRole("button", { name: "Fechar modal" });
    closeButton.focus();

    await act(async () => {
      scannerMock.failureCallback?.("No QR code found");
      scannerMock.failureCallback?.("No QR code found");
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Não foi possível ler o QR Code.")).not.toBeInTheDocument();
    expect(scannerMock.stop).not.toHaveBeenCalled();
    expect(closeButton).toHaveFocus();
  });

  it("valida código obrigatório e inválido perto do campo, sem toast duplicado", async () => {
    const callbacks = renderModal();
    const input = screen.getByLabelText("Código da etiqueta");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Informe ou leia o código da etiqueta.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveFocus();
    expect(api.post).not.toHaveBeenCalled();
    expect(callbacks.onToast).not.toHaveBeenCalled();

    await userEvent.type(input, "ABC");
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Digite um código de etiqueta válido.");
    expect(api.post).not.toHaveBeenCalled();
    expect(callbacks.onToast).not.toHaveBeenCalled();
  });

  it("padroniza loading acessível durante o check-out manual", async () => {
    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));
    renderModal();

    await userEvent.type(screen.getByLabelText("Código da etiqueta"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    expect(screen.getByRole("button", { name: "Realizando check-out..." })).toBeDisabled();
    expect(screen.getByText("Realizando check-out, aguarde...")).toHaveAttribute("aria-live", "polite");

    resolvePost({ data: {} });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Realizando check-out..." })).not.toBeInTheDocument());
  });

  it("em sucesso exibe apenas o toast padronizado, atualiza a lista e fecha o modal", async () => {
    api.post.mockResolvedValue({ data: {} });
    const callbacks = renderModal();

    await userEvent.type(screen.getByLabelText("Código da etiqueta"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/visits/checkout", { visitCode: "12345678" }));
    expect(callbacks.onToast).toHaveBeenCalledTimes(1);
    expect(callbacks.onToast).toHaveBeenCalledWith("Check-out realizado com sucesso.", "success");
    expect(callbacks.onCheckoutDone).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("padroniza visita inexistente e visita encerrada", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 404, data: { message: "Visita em aberto não encontrada." } } });
    renderModal();

    await userEvent.type(screen.getByLabelText("Código da etiqueta"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nenhuma visita foi encontrada para o código informado."
    );

    api.post.mockRejectedValueOnce({ response: { status: 400, data: { message: "Checkout realizado." } } });
    await userEvent.clear(screen.getByLabelText("Código da etiqueta"));
    await userEvent.type(screen.getByLabelText("Código da etiqueta"), "87654321");
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esta visita já foi finalizada.");
  });

  it("padroniza erro de rede e erro inesperado sem mensagens técnicas", async () => {
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    renderModal();

    await userEvent.type(screen.getByLabelText("Código da etiqueta"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível conectar ao servidor.");
    expect(screen.getByRole("alert")).toHaveTextContent("Verifique sua conexão e tente novamente.");

    api.post.mockRejectedValueOnce({ response: { status: 500, data: { message: "token JWT SQL Prisma stack request" } } });
    await userEvent.clear(screen.getByLabelText("Código da etiqueta"));
    await userEvent.type(screen.getByLabelText("Código da etiqueta"), "87654321");
    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível concluir o check-out.");
    expect(screen.getByRole("alert")).toHaveTextContent("Tente novamente em alguns instantes.");
    expect(screen.queryByText(/token|jwt|sql|prisma|stack|request/i)).not.toBeInTheDocument();
  });

  it("padroniza conteúdo QR inválido sem chamar API", async () => {
    renderModal();
    await waitFor(() => expect(scannerMock.start).toHaveBeenCalled());

    await act(async () => {
      await scannerMock.successCallback?.("ABC");
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Digite um código de etiqueta válido.");
    expect(api.post).not.toHaveBeenCalled();
    expect(scannerMock.stop).not.toHaveBeenCalled();
  });

  it("reabre sem reutilizar erro anterior", async () => {
    const first = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Dar saída" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe ou leia o código da etiqueta.");
    first.unmount();

    renderModal();

    await waitFor(() => expect(scannerMock.start).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Código da etiqueta")).toHaveAttribute("aria-invalid", "false");
  });

  it("padroniza câmera sem suporte", async () => {
    setCameraSupport(false);
    renderModal();

    expect(await screen.findByRole("alert")).toHaveTextContent("Este dispositivo não suporta leitura pela câmera.");
  });

  it("padroniza câmera indisponível sem termos técnicos", async () => {
    setCameraSupport(true);
    scannerMock.start.mockRejectedValueOnce(new Error("NotAllowedError: getUserMedia MediaDevices"));
    renderModal();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível acessar a câmera.");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Verifique as permissões e tente novamente.");
    expect(screen.queryByText(/MediaDevices|getUserMedia|NotAllowedError|NotFoundError/i)).not.toBeInTheDocument();
  });
});
