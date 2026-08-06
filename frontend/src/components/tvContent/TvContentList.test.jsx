import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TvContentList from "./TvContentList";

const branches = [{ id: 1, name: "Matriz" }];

function renderList(items, handlers = {}) {
  return render(
    <TvContentList
      allBranches={branches}
      error={handlers.error ?? ""}
      items={items}
      loading={handlers.loading ?? false}
      onEdit={handlers.onEdit ?? vi.fn()}
      onRemove={handlers.onRemove ?? vi.fn()}
      onRetry={handlers.onRetry ?? vi.fn()}
      onToggle={handlers.onToggle ?? vi.fn()}
    />
  );
}

function contentItem(overrides) {
  return {
    id: overrides.id ?? 1,
    title: overrides.title ?? "Mídia TV",
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

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("TvContentList title cell", () => {
  it("renderiza titulo com menos de 20 caracteres completo", () => {
    renderList([contentItem({ title: "Foto institucional" })]);

    const titleText = screen.getByText("Foto institucional");
    expect(titleText).toBeInTheDocument();
    expect(titleText).toHaveAttribute("title", "Foto institucional");
  });

  it("renderiza titulo com exatamente 20 caracteres completo e sem reticencias", () => {
    renderList([contentItem({ title: "12345678901234567890" })]);

    const titleText = screen.getByText("12345678901234567890");
    expect(titleText).toBeInTheDocument();
    expect(titleText).toHaveAttribute("title", "12345678901234567890");
    expect(titleText).not.toHaveTextContent("...");
  });

  it("renderiza titulo com mais de 20 caracteres com os primeiros 20 e reticencias", () => {
    renderList([contentItem({ title: "123456789012345678901" })]);

    const titleText = screen.getByText("12345678901234567890...");
    expect(titleText).toBeInTheDocument();
    expect(titleText).toHaveAttribute("title", "123456789012345678901");
  });

  it("mantem titulo muito longo completo no atributo title", () => {
    const longTitle = "Campanha de conscientizacao sobre seguranca no trabalho";

    renderList([contentItem({ title: longTitle })]);

    const titleText = screen.getByText("Campanha de conscien...");
    expect(titleText).toHaveClass("tc-titleText");
    expect(titleText).toHaveAttribute("title", longTitle);
  });

  it("mantem o fallback atual para titulo vazio", () => {
    renderList([contentItem({ title: "" })]);

    const row = screen.getAllByRole("row")[1];
    const titleCell = row.querySelector(".tc-titleCell");
    const titleText = titleCell.querySelector(".tc-titleText");

    expect(titleText).toHaveAttribute("title", "");
    expect(titleCell.textContent).toBe("");
  });

  it("mantem o fallback atual para titulo nulo ou indefinido", () => {
    renderList([contentItem({ title: null }), contentItem({ id: 2, title: undefined })]);

    const rows = screen.getAllByRole("row").slice(1);

    rows.forEach((row) => {
      const titleCell = row.querySelector(".tc-titleCell");
      const titleText = titleCell.querySelector(".tc-titleText");

      expect(titleText).toHaveAttribute("title", "");
      expect(titleCell.textContent).toBe("");
    });
  });

  it("nao afeta acoes, preview, filiais ou demais dados da linha", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const item = contentItem({
      title: "Campanha de conscientizacao sobre seguranca no trabalho",
      fileSize: 2048,
      branches: [{ id: 2, name: "Filial Norte" }],
      order: 7,
      isActive: false,
    });

    renderList([item], { onEdit });

    const row = screen.getAllByRole("row")[1];

    expect(within(row).getByRole("img", { name: item.title })).toBeInTheDocument();
    expect(within(row).getByText("Imagem")).toBeInTheDocument();
    expect(within(row).getByText("2.0 KB")).toBeInTheDocument();
    expect(within(row).getByText("Filial Norte")).toBeInTheDocument();
    expect(within(row).getByText("7")).toBeInTheDocument();
    expect(within(row).getByText("Inativo")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: /Editar conte.do Campanha/ }));

    expect(onEdit).toHaveBeenCalledWith(item);
  });
});

describe("TvContentList preview", () => {
  it("exibe loading, estado vazio, erro de carregamento e retry padronizados", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <TvContentList
        allBranches={branches}
        items={[]}
        loading
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText("Carregando conteúdos...")).toBeInTheDocument();

    rerender(
      <TvContentList
        allBranches={branches}
        items={[]}
        loading={false}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByText("Nenhum conteúdo cadastrado.")).toBeInTheDocument();
    expect(screen.getByText("Adicione um conteúdo para começar.")).toBeInTheDocument();

    rerender(
      <TvContentList
        allBranches={branches}
        error="Não foi possível carregar os conteúdos da TV."
        items={[]}
        loading={false}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onRetry={onRetry}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Tente novamente.");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("exibe data e hora em linhas separadas sem segundos e com tooltip completo", () => {
    renderList([contentItem({ createdAt: "2026-07-24T13:24:43" })]);

    const dateTimeCell = screen.getByTitle("24/07/2026 13:24:43");

    expect(within(dateTimeCell).getByText("24/07/2026")).toBeInTheDocument();
    expect(within(dateTimeCell).getByText("13:24")).toBeInTheDocument();
    expect(dateTimeCell).not.toHaveTextContent("13:24:43");
    expect(dateTimeCell.querySelector(".tc-dateTimeDate")).toBeInTheDocument();
    expect(dateTimeCell.querySelector(".tc-dateTimeTime")).toBeInTheDocument();
  });

  it("mantem o tratamento atual para datas invalidas", () => {
    renderList([contentItem({ createdAt: "data-invalida" })]);

    const dateTimeCell = screen.getByTitle("-");

    expect(dateTimeCell).toHaveTextContent("-");
    expect(dateTimeCell.querySelector(".tc-dateTimeTime")).not.toBeInTheDocument();
  });

  it("mantem a ordem e os dados originais dos itens", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const first = contentItem({
      id: 1,
      title: "Primeiro conteudo",
      createdAt: "2026-07-24T13:24:43",
      order: 2,
    });
    const second = contentItem({
      id: 2,
      title: "Segundo conteudo",
      createdAt: "2026-07-23T09:10:11",
      order: 1,
    });

    renderList([first, second], { onEdit });

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Primeiro conteudo")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Segundo conteudo")).toBeInTheDocument();
    expect(within(rows[0]).getByText("2")).toBeInTheDocument();
    expect(within(rows[1]).getByText("1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Editar conte.do Primeiro conteudo/ }));

    expect(onEdit).toHaveBeenCalledWith(first);
  });

  it("renderiza video sem controls e sem autoplay", () => {
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    const video = document.querySelector(".tc-preview video");
    expect(video).toBeInTheDocument();
    expect(video).not.toHaveAttribute("controls");
    expect(video).not.toHaveAttribute("autoplay");
  });

  it("exibe o icone de play sobre o preview do video", () => {
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    const preview = screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" });
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

  it("exibe fallback acessivel quando a previa da imagem falha", () => {
    renderList([contentItem({ title: "", fileUrl: "/uploads/tv/banner.webp" })]);

    fireEvent.error(screen.getByRole("img", { name: "Prévia do conteúdo" }));

    expect(screen.getByRole("img", { name: "Prévia indisponível" })).toHaveTextContent(
      "Não foi possível carregar a prévia desta mídia."
    );
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

    expect(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" })).toBeInTheDocument();
    expect(document.querySelector(".tc-videoDuration")).not.toBeInTheDocument();
  });

  it("abre modal ao clicar no preview de video", async () => {
    const user = userEvent.setup();
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    await user.click(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" }));

    expect(screen.getByRole("dialog", { name: "Prévia de Mídia TV" })).toBeInTheDocument();
  });

  it("renderiza video com controles dentro do modal", async () => {
    const user = userEvent.setup();
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    await user.click(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" }));

    const dialog = screen.getByRole("dialog", { name: "Prévia de Mídia TV" });
    const modalVideo = dialog.querySelector("video");
    expect(modalVideo).toBeInTheDocument();
    expect(modalVideo).toHaveAttribute("controls");
    expect(modalVideo).toHaveAttribute("autoplay");
  });

  it("fecha o modal pelo botao de fechar", async () => {
    const user = userEvent.setup();
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    await user.click(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" }));
    await user.click(screen.getByRole("button", { name: "Fechar prévia" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fecha o modal ao clicar no backdrop", async () => {
    const user = userEvent.setup();
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    await user.click(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" }));
    await user.click(screen.getByRole("dialog", { name: "Prévia de Mídia TV" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nao fecha o modal ao clicar no conteudo interno", async () => {
    const user = userEvent.setup();
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    await user.click(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" }));
    const dialog = screen.getByRole("dialog", { name: "Prévia de Mídia TV" });

    await user.click(dialog.querySelector(".tc-previewModal"));

    expect(screen.getByRole("dialog", { name: "Prévia de Mídia TV" })).toBeInTheDocument();
  });

  it("fecha o modal ao pressionar Escape", async () => {
    const user = userEvent.setup();
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    await user.click(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pausa e reinicia o video ao fechar", async () => {
    const user = userEvent.setup();
    const { pause } = mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);

    await user.click(screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" }));
    const dialog = screen.getByRole("dialog", { name: "Prévia de Mídia TV" });
    const modalVideo = dialog.querySelector("video");
    modalVideo.currentTime = 12;

    await user.click(screen.getByRole("button", { name: "Fechar prévia" }));

    expect(pause).toHaveBeenCalled();
    expect(modalVideo.currentTime).toBe(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("imagem nao abre modal", async () => {
    const user = userEvent.setup();
    renderList([contentItem({ title: "Banner principal", fileUrl: "/uploads/tv/banner.webp" })]);

    await user.click(screen.getByRole("img", { name: "Banner principal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("devolve o foco ao preview que abriu o modal", async () => {
    const user = userEvent.setup();
    mockMediaPlayback();
    renderList([contentItem({ type: "VIDEO", fileUrl: "/uploads/tv/video.mp4" })]);
    const preview = screen.getByRole("button", { name: "Reproduzir prévia de Mídia TV" });

    await user.click(preview);
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar prévia" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Fechar prévia" }));

    await waitFor(() => expect(preview).toHaveFocus());
  });
});

describe("TvContentList actions", () => {
  it("botao de editar possui title e aria-label corretos e chama onEdit", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const item = contentItem({ title: "Banner recepcao" });
    renderList([item], { onEdit });

    const editButton = screen.getByRole("button", { name: "Editar conteúdo Banner recepcao" });

    expect(editButton).toHaveAttribute("title", "Editar conteúdo");

    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it("conteudo ativo exibe acao Desativar conteúdo e chama onToggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const item = contentItem({ title: "Comunicado ativo", isActive: true });
    renderList([item], { onToggle });

    const toggleButton = screen.getByRole("button", {
      name: "Desativar conteúdo Comunicado ativo",
    });

    expect(toggleButton).toHaveAttribute("title", "Desativar conteúdo");

    await user.click(toggleButton);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(item);
  });

  it("conteudo inativo exibe acao Ativar conteúdo", () => {
    renderList([contentItem({ title: "Comunicado pausado", isActive: false })]);

    const toggleButton = screen.getByRole("button", {
      name: "Ativar conteúdo Comunicado pausado",
    });

    expect(toggleButton).toHaveAttribute("title", "Ativar conteúdo");
  });

  it("botao de excluir possui title e aria-label corretos e chama onRemove", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const item = contentItem({ title: "Campanha antiga" });
    renderList([item], { onRemove });

    const removeButton = screen.getByRole("button", {
      name: "Excluir conteúdo Campanha antiga",
    });

    expect(removeButton).toHaveAttribute("title", "Excluir conteúdo");

    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(item);
  });

  it("botao de ativar/desativar fica desabilitado durante a acao e evita cliques repetidos", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onToggle = vi.fn(() => pending.promise);
    renderList([contentItem({ title: "Vídeo institucional" })], { onToggle });

    const toggleButton = screen.getByRole("button", {
      name: "Desativar conteúdo Vídeo institucional",
    });

    await user.click(toggleButton);
    await user.click(toggleButton);

    expect(toggleButton).toBeDisabled();
    expect(toggleButton).toHaveAttribute("aria-busy", "true");
    expect(onToggle).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve();
    });

    await waitFor(() => expect(toggleButton).not.toBeDisabled());
  });

  it("botao de excluir fica desabilitado durante a acao e evita cliques repetidos", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onRemove = vi.fn(() => pending.promise);
    renderList([contentItem({ title: "Arte vencida" })], { onRemove });

    const removeButton = screen.getByRole("button", {
      name: "Excluir conteúdo Arte vencida",
    });

    await user.click(removeButton);
    await user.click(removeButton);

    expect(removeButton).toBeDisabled();
    expect(removeButton).toHaveAttribute("aria-busy", "true");
    expect(onRemove).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve();
    });

    await waitFor(() => expect(removeButton).not.toBeDisabled());
  });

  it("estado de carregamento nao afeta outros itens da lista", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const onToggle = vi.fn(() => pending.promise);
    renderList(
      [
        contentItem({ id: 1, title: "Primeiro conteudo" }),
        contentItem({ id: 2, title: "Segundo conteudo" }),
      ],
      { onToggle }
    );

    const firstToggle = screen.getByRole("button", {
      name: "Desativar conteúdo Primeiro conteudo",
    });
    const secondToggle = screen.getByRole("button", {
      name: "Desativar conteúdo Segundo conteudo",
    });

    await user.click(firstToggle);

    expect(firstToggle).toBeDisabled();
    expect(secondToggle).not.toBeDisabled();
  });
});
