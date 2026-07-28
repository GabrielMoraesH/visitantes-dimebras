import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TvContentList from "./TvContentList";

const branches = [{ id: 1, name: "Matriz" }];

function renderList(items) {
  return render(
    <TvContentList
      allBranches={branches}
      items={items}
      loading={false}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
      onToggle={vi.fn()}
    />
  );
}

function contentItem(overrides) {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? "Midia TV",
    type: overrides.type ?? "IMAGE",
    fileUrl: overrides.fileUrl ?? "/uploads/tv/midia.jpg",
    fileSize: overrides.fileSize ?? 1024,
    branches,
    order: 0,
    isActive: true,
    createdAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

function mockMediaPlayback() {
  const play = vi
    .spyOn(window.HTMLMediaElement.prototype, "play")
    .mockImplementation(() => Promise.resolve());
  const pause = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

  return { pause, play };
}

describe("TvContentList preview", () => {
  it("renderiza video sem controls e sem autoplay", () => {
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    const video = document.querySelector(".tc-preview video");
    expect(video).toBeInTheDocument();
    expect(video).not.toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
  });

  it("exibe o icone de play sobre o preview do video", () => {
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    const preview = screen.getByRole("button", { name: "Reproduzir preview de Midia TV" });
    const playIcon = preview.querySelector(".tc-videoPlay");

    expect(playIcon).toBeInTheDocument();
    expect(playIcon).toHaveAttribute("aria-hidden", "true");
  });

  it("continua renderizando imagem normalmente", () => {
    renderList([contentItem({ title: "Banner principal", fileUrl: "/uploads/tv/banner.webp" })]);

    const image = screen.getByRole("img", { name: "Banner principal" });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", expect.stringContaining("/uploads/tv/banner.webp"));
    expect(document.querySelector(".tc-preview video")).not.toBeInTheDocument();
  });

  it("exibe duracao depois de loadedmetadata", () => {
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    const video = document.querySelector(".tc-preview video");
    Object.defineProperty(video, "duration", { configurable: true, value: 90 });

    fireEvent.loadedMetadata(video);

    expect(screen.getByText("01:30")).toBeInTheDocument();
  });

  it("nao quebra quando a duracao nao esta disponivel", () => {
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    const video = document.querySelector(".tc-preview video");
    Object.defineProperty(video, "duration", { configurable: true, value: Number.NaN });

    fireEvent.loadedMetadata(video);

    expect(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" })).toBeInTheDocument();
    expect(document.querySelector(".tc-videoDuration")).not.toBeInTheDocument();
  });

  it("abre modal ao clicar no preview de video", () => {
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" }));

    expect(screen.getByRole("dialog", { name: "Preview de Midia TV" })).toBeInTheDocument();
  });

  it("renderiza video com controles dentro do modal", () => {
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" }));

    const dialog = screen.getByRole("dialog", { name: "Preview de Midia TV" });
    const modalVideo = dialog.querySelector("video");
    expect(modalVideo).toBeInTheDocument();
    expect(modalVideo).toHaveAttribute("controls");
    expect(modalVideo).toHaveAttribute("autoplay");
  });

  it("fecha o modal pelo botao de fechar", () => {
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar preview" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fecha o modal ao clicar no backdrop", () => {
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" }));
    fireEvent.click(screen.getByRole("dialog", { name: "Preview de Midia TV" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nao fecha o modal ao clicar no conteudo interno", () => {
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" }));
    const dialog = screen.getByRole("dialog", { name: "Preview de Midia TV" });

    fireEvent.click(dialog.querySelector(".tc-previewModal"));

    expect(screen.getByRole("dialog", { name: "Preview de Midia TV" })).toBeInTheDocument();
  });

  it("fecha o modal ao pressionar Escape", () => {
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pausa e reinicia o video ao fechar", () => {
    const { pause } = mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    fireEvent.click(screen.getByRole("button", { name: "Reproduzir preview de Midia TV" }));
    const dialog = screen.getByRole("dialog", { name: "Preview de Midia TV" });
    const modalVideo = dialog.querySelector("video");
    modalVideo.currentTime = 12;

    fireEvent.click(screen.getByRole("button", { name: "Fechar preview" }));

    expect(pause).toHaveBeenCalled();
    expect(modalVideo.currentTime).toBe(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("imagem nao abre modal", () => {
    renderList([contentItem({ title: "Banner principal", fileUrl: "/uploads/tv/banner.webp" })]);

    fireEvent.click(screen.getByRole("img", { name: "Banner principal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("devolve o foco ao preview que abriu o modal", async () => {
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);
    const preview = screen.getByRole("button", { name: "Reproduzir preview de Midia TV" });

    fireEvent.click(preview);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar preview" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Fechar preview" }));

    await waitFor(() => expect(preview).toHaveFocus());
  });
});
