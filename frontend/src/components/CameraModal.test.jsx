import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CameraModal from "./CameraModal";

function mockCamera() {
  const stop = vi.fn();
  const drawImage = vi.fn();
  const toBlob = vi.fn((callback) => {
    callback(new Blob(["foto"], { type: "image/jpeg" }));
  });
  const stream = {
    getTracks: () => [{ stop }],
  };

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    },
  });

  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ({ drawImage })),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: toBlob,
  });

  return { drawImage, stop, toBlob };
}

function setVideoReady() {
  const video = document.querySelector("video");
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
  fireEvent.loadedMetadata(video);
}

describe("CameraModal", () => {
  beforeEach(() => {
    mockCamera();
  });

  it("renderiza como dialog modal com nome acessivel pelo tipo de captura", () => {
    render(<CameraModal captureTarget="docFront" mode="document" onClose={vi.fn()} onCapture={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Fotografar documento - frente" });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
  });

  it("mantem a estrutura responsiva sem duplicar modal para mobile e desktop", () => {
    const { container } = render(<CameraModal captureTarget="docBack" mode="document" onClose={vi.fn()} onCapture={vi.fn()} />);

    expect(container.querySelectorAll(".cam-overlay")).toHaveLength(1);
    expect(container.querySelectorAll(".cam-modal")).toHaveLength(1);
    expect(container.querySelectorAll(".cam-videoWrap")).toHaveLength(1);
    expect(container.querySelectorAll(".cam-video")).toHaveLength(1);
    expect(container.querySelectorAll(".doc-guide")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Fotografar documento - verso" })).toHaveClass("cam-modal");
  });

  it("mantem os atributos funcionais do video e as acoes acessiveis", () => {
    const { container } = render(<CameraModal onClose={vi.fn()} onCapture={vi.fn()} />);
    const video = container.querySelector("video");

    expect(video).toHaveClass("cam-video");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveProperty("muted", true);
    expect(screen.getByRole("button", { name: /fechar c.mera/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capturar" })).toBeDisabled();
  });

  it("usa classes locais deterministicas nas acoes sem depender de botoes globais", () => {
    const { container } = render(<CameraModal onClose={vi.fn()} onCapture={vi.fn()} />);
    const actionButtons = within(container.querySelector(".cam-actions")).getAllByRole("button");
    const cancelButton = screen.getByRole("button", { name: "Fechar câmera" });
    const captureButton = screen.getByRole("button", { name: "Capturar" });

    expect(actionButtons).toEqual([cancelButton, captureButton]);
    expect(cancelButton).toHaveTextContent("Cancelar");
    expect(cancelButton).toHaveClass("cam-actionButton", "cam-actionButton--secondary");
    expect(cancelButton).not.toHaveClass("btn", "btn-light", "btn-primary");
    expect(captureButton).toHaveClass("cam-actionButton", "cam-actionButton--primary");
    expect(captureButton).not.toHaveClass("btn", "btn-light", "btn-primary");
    expect(captureButton).toBeDisabled();
  });

  it("mantem as regras CSS responsivas do painel e da area de video", () => {
    const css = readFileSync("src/styles/cameraModal.css", "utf8");

    expect(css).toContain("max-width: calc(100vw - 32px)");
    expect(css).toContain("max-height: calc(100vh - 32px)");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("aspect-ratio: 16 / 9");
    expect(css).toContain("max-height: min(420px, calc(100vh - 160px))");
    expect(css).toContain("height: 100%");
    expect(css).toContain("@media (max-height: 520px)");
  });

  it("define localmente os estilos base, variantes e estados dos botoes do modal", () => {
    const css = readFileSync("src/styles/cameraModal.css", "utf8");
    const source = readFileSync("src/components/CameraModal.jsx", "utf8");

    expect(source).toContain('import "../styles/cameraModal.css"');
    expect(css).toContain(".cam-actionButton");
    expect(css).toContain("appearance: none");
    expect(css).toContain("font: inherit");
    expect(css).toContain(".cam-actionButton--primary");
    expect(css).toContain(".cam-actionButton--secondary");
    expect(css).toContain(".cam-actionButton:hover:not(:disabled)");
    expect(css).toContain(".cam-actionButton:active:not(:disabled)");
    expect(css).toContain(".cam-actionButton:focus-visible");
    expect(css).toContain(".cam-actionButton:disabled");
    expect(css).toContain(".cam-actionButton--primary:disabled");
    expect(css).toContain(".cam-actions .cam-actionButton");
  });

  it("move o foco inicial para o botao de fechar", async () => {
    render(<CameraModal onClose={vi.fn()} onCapture={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Fechar câmera" })).toHaveFocus());
  });

  it("mantem Tab e Shift+Tab circulando dentro do modal", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Fora do modal</button>
        <CameraModal onClose={vi.fn()} onCapture={vi.fn()} />
      </>
    );

    const closeButton = screen.getByRole("button", { name: "Fechar câmera" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    setVideoReady();
    const captureButton = screen.getByRole("button", { name: "Capturar" });

    await user.tab();
    expect(captureButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
    expect(screen.getByRole("button", { name: "Fora do modal" })).not.toHaveFocus();

    await user.tab({ shift: true });
    expect(captureButton).toHaveFocus();
  });

  it("fecha com Escape usando a limpeza da camera", async () => {
    const { stop } = mockCamera();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CameraModal onClose={onClose} onCapture={vi.fn()} />);

    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("nao fecha ao clicar no conteudo ou no backdrop quando este comportamento nao existe", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<CameraModal onClose={onClose} onCapture={vi.fn()} />);

    await user.click(container.querySelector(".cam-modal"));
    await user.click(container.querySelector(".cam-overlay"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("remove listeners, restaura scroll e devolve foco ao desmontar", async () => {
    const triggerRef = { current: document.createElement("button") };
    document.body.appendChild(triggerRef.current);
    triggerRef.current.focus();
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const previousOverflow = document.body.style.overflow;

    const { unmount } = render(<CameraModal onClose={vi.fn()} onCapture={vi.fn()} returnFocusRef={triggerRef} />);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(removeSpy.mock.calls.length).toBeGreaterThanOrEqual(
      addSpy.mock.calls.filter(([eventName]) => eventName === "keydown").length
    );
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(triggerRef.current).toHaveFocus();
  });

  it("mantem o fluxo de captura e para a camera apos confirmar", async () => {
    const { drawImage, stop, toBlob } = mockCamera();
    const onCapture = vi.fn();
    const user = userEvent.setup();
    render(<CameraModal onClose={vi.fn()} onCapture={onCapture} />);

    setVideoReady();
    await user.click(screen.getByRole("button", { name: "Capturar" }));

    await waitFor(() => expect(onCapture).toHaveBeenCalledWith(expect.any(Blob)));
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 0, 0, 640, 480);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
