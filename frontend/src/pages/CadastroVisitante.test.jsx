import { Route, Routes, MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CadastroVisitante from "./CadastroVisitante";
import api from "../services/api";
import { setSession } from "../services/session";

vi.mock("../services/api", () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderCadastro(initialEntry = "/cadastro") {
  setSession("token-teste", { id: 1, username: "recepcao", role: "RECEPCAO" });

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/cadastro"
          element={
            <>
              <LocationProbe />
              <CadastroVisitante />
            </>
          }
        />
        <Route path="/login" element={<div>Login destino</div>} />
        <Route path="/checkin" element={<div>Checkin destino</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function getCpfInput() {
  return screen.getByLabelText(/^cpf$/i);
}

function getCpfBadge(input = getCpfInput()) {
  return input.closest(".cadastro-cpfBadge");
}

function getCaptureButtons() {
  return [
    screen.getByRole("button", { name: /tirar foto do visitante/i }),
    screen.getByRole("button", { name: /fotografar documento \(frente\)/i }),
    screen.getByRole("button", { name: /fotografar documento \(verso\)/i }),
  ];
}

function getMediaItem(container, placeholder) {
  return container.querySelector(`[data-media-item="${placeholder}"]`);
}

function mockCamera() {
  const stop = vi.fn();
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
    value: vi.fn(() => ({ drawImage: vi.fn() })),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value(callback) {
      callback(new Blob(["foto"], { type: "image/jpeg" }));
    },
  });

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((file) => `blob:${file.name}`),
  });

  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });

  return { stop };
}

function setVideoReady() {
  const video = document.querySelector("video");
  Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
  fireEvent.loadedMetadata(video);
}

async function captureMedia(user, buttonName) {
  await user.click(screen.getByRole("button", { name: buttonName }));
  await screen.findByRole("dialog");
  setVideoReady();
  await user.click(screen.getByRole("button", { name: "Capturar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

async function fillValidCadastro(user) {
  await user.type(screen.getByLabelText(/^cpf$/i), "52998224725");
  await user.type(screen.getByLabelText(/nome completo/i), "Maria Silva");
  await user.type(screen.getByLabelText(/telefone/i), "45999999999");
  await user.type(screen.getByLabelText(/empresa/i), "Dimebras");

  await captureMedia(user, /tirar foto do visitante/i);
  await captureMedia(user, /fotografar documento \(frente\)/i);
  await captureMedia(user, /fotografar documento \(verso\)/i);
}

describe("CadastroVisitante CPF feedback", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockCamera();
    api.get.mockRejectedValue({ response: { status: 404 } });
    api.post.mockResolvedValue({ data: { id: 10 } });
    api.put.mockResolvedValue({});
    api.delete.mockResolvedValue({});
  });

  it("abre com CPF vazio em estado visual neutro", () => {
    renderCadastro();

    const cpfInput = getCpfInput();

    expect(screen.queryByText("Digite um CPF válido.")).not.toBeInTheDocument();
    expect(screen.queryByText(/cpf válido/i)).not.toBeInTheDocument();
    expect(cpfInput).toHaveAttribute("aria-invalid", "false");
    expect(getCpfBadge(cpfInput)).not.toHaveClass("ok");
    expect(getCpfBadge(cpfInput)).not.toHaveClass("bad");
  });

  it("associa labels aos inputs e mantem autocomplete correto", () => {
    renderCadastro();

    expect(screen.getByLabelText(/^cpf$/i)).toHaveAttribute("id", "cadastro-cpf");
    expect(screen.getByLabelText(/nome completo/i)).toHaveAttribute("id", "cadastro-name");
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("id", "cadastro-phone");
    expect(screen.getByLabelText(/empresa/i)).toHaveAttribute("id", "cadastro-company");

    expect(screen.getByLabelText(/^cpf$/i)).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText(/nome completo/i)).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText(/empresa/i)).toHaveAttribute("autocomplete", "organization");
  });

  it("renderiza formulario, midia e acao final uma unica vez sem ids duplicados", () => {
    const { container } = renderCadastro();
    const ids = Array.from(container.querySelectorAll("[id]"), (element) => element.id);

    expect(container.querySelectorAll(".cadastro-fields")).toHaveLength(1);
    expect(container.querySelectorAll(".cadastro-media")).toHaveLength(1);
    expect(container.querySelectorAll(".cadastro-submit")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /salvar/i })).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nao mostra mensagem de salvamento no estado normal e mantem status acessivel reservado", () => {
    renderCadastro();

    expect(screen.queryByText("Salvando cadastro, aguarde...")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("mantem o fluxo semantico mobile com dados e salvar antes da midia", () => {
    const { container } = renderCadastro();

    const fields = container.querySelector(".cadastro-fields");
    const media = container.querySelector(".cadastro-media");
    const submit = container.querySelector(".cadastro-submit");

    expect(fields.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fields).toContainElement(submit);
    expect(submit.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fields).toContainElement(screen.getByLabelText(/^cpf$/i));
    expect(media).toContainElement(screen.getByRole("button", { name: /tirar foto do visitante/i }));
    const saveButton = within(submit).getByRole("button", { name: /salvar/i });
    expect(submit).toContainElement(saveButton);
    expect(saveButton.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("usa o breakpoint responsivo existente para preservar desktop e empilhar mobile", () => {
    renderCadastro();
    const css = readFileSync("src/styles/cadastro.css", "utf8");

    expect(css).toContain("grid-template-areas: \"media fields\"");
    expect(css).toContain("@media (max-width: 980px)");
    expect(css).toContain("grid-template-areas:\n      \"fields\"\n      \"media\"");
  });

  it("mantem previews e botoes de midia contidos em largura reduzida por classe estrutural", () => {
    const { container } = renderCadastro();
    const css = readFileSync("src/styles/cadastro.css", "utf8");

    expect(container.querySelectorAll(".cadastro-photoBox")).toHaveLength(3);
    expect(container.querySelectorAll(".cadastro-media .w-full")).toHaveLength(3);
    expect(css).toContain(".cadastro-grid > *");
    expect(css).toContain("min-width: 0");
    expect(css).toContain(".cadastro-media .w-full");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("white-space: normal");
  });

  it("usa variante secundaria apenas nos tres botoes de captura e mantem salvar como primario", () => {
    const { container } = renderCadastro();

    for (const button of getCaptureButtons()) {
      expect(button).toHaveClass("btn", "btn-capture", "w-full");
      expect(button).not.toHaveClass("btn-primary");
    }

    const saveButton = screen.getByRole("button", { name: /salvar/i });
    expect(saveButton).toHaveClass("btn", "btn-primary", "w-full", "btn-lg");
    expect(saveButton).not.toHaveClass("btn-capture");
    expect(container.querySelectorAll(".cadastro-media .btn-capture")).toHaveLength(3);
    expect(container.querySelectorAll(".cadastro-submit .btn-capture")).toHaveLength(0);
  });

  it("nao exibe indicador de midia concluida quando os tres previews estao vazios", () => {
    const { container } = renderCadastro();

    expect(screen.queryByText(/capturad[ao]/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".cadastro-mediaStatus")).toHaveLength(0);
    expect(screen.getByText("FOTO DO VISITANTE")).toBeInTheDocument();
    expect(screen.getByText("DOCUMENTO (FRENTE)")).toBeInTheDocument();
    expect(screen.getByText("DOCUMENTO (VERSO)")).toBeInTheDocument();
  });

  it.each([
    {
      absentStatuses: ["Frente capturada", "Verso capturado"],
      buttonName: /tirar foto do visitante/i,
      placeholder: "FOTO DO VISITANTE",
      statusText: "Foto capturada",
    },
    {
      absentStatuses: ["Foto capturada", "Verso capturado"],
      buttonName: /fotografar documento \(frente\)/i,
      placeholder: "DOCUMENTO (FRENTE)",
      statusText: "Frente capturada",
    },
    {
      absentStatuses: ["Foto capturada", "Frente capturada"],
      buttonName: /fotografar documento \(verso\)/i,
      placeholder: "DOCUMENTO (VERSO)",
      statusText: "Verso capturado",
    },
  ])("mostra indicador apenas no bloco capturado: $statusText", async ({ absentStatuses, buttonName, placeholder, statusText }) => {
    const user = userEvent.setup();
    const { container } = renderCadastro();

    await captureMedia(user, buttonName);

    const mediaItem = getMediaItem(container, placeholder);
    const status = within(mediaItem).getByText(statusText);

    expect(status).toHaveClass("cadastro-mediaStatus");
    expect(status).toHaveTextContent(statusText);
    expect(within(status).getByText("✓")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".cadastro-mediaStatus")).toHaveLength(1);
    for (const absentStatus of absentStatuses) {
      expect(screen.queryByText(absentStatus)).not.toBeInTheDocument();
    }
  });

  it("exibe tres indicadores acessiveis quando foto, frente e verso foram capturados", async () => {
    const user = userEvent.setup();
    const { container } = renderCadastro();

    await captureMedia(user, /tirar foto do visitante/i);
    await captureMedia(user, /fotografar documento \(frente\)/i);
    await captureMedia(user, /fotografar documento \(verso\)/i);

    expect(screen.getByText("Foto capturada")).toHaveClass("cadastro-mediaStatus");
    expect(screen.getByText("Frente capturada")).toHaveClass("cadastro-mediaStatus");
    expect(screen.getByText("Verso capturado")).toHaveClass("cadastro-mediaStatus");
    expect(container.querySelectorAll(".cadastro-mediaStatus")).toHaveLength(3);
    expect(container.querySelectorAll(".cadastro-mediaStatusIcon[aria-hidden=\"true\"]")).toHaveLength(3);
  });

  it("define estados interativos da variante secundaria sem depender de cor computada", () => {
    renderCadastro();
    const css = readFileSync("src/styles/cadastro.css", "utf8");

    expect(css).toContain(".cadastro-media .btn-capture");
    expect(css).toContain(".cadastro-media .btn-capture:hover:not(:disabled)");
    expect(css).toContain(".cadastro-media .btn-capture:focus-visible");
    expect(css).toContain(".cadastro-media .btn-capture:active:not(:disabled)");
    expect(css).toContain(".cadastro-media .btn-capture:disabled");
  });

  it("preserva textos atuais dos botoes de captura antes e depois de capturar midia", async () => {
    const user = userEvent.setup();
    renderCadastro();

    expect(screen.getByRole("button", { name: "TIRAR FOTO DO VISITANTE" })).toHaveClass("btn-capture");
    expect(screen.getByRole("button", { name: "FOTOGRAFAR DOCUMENTO (FRENTE)" })).toHaveClass("btn-capture");
    expect(screen.getByRole("button", { name: "FOTOGRAFAR DOCUMENTO (VERSO)" })).toHaveClass("btn-capture");

    await captureMedia(user, /tirar foto do visitante/i);
    await captureMedia(user, /fotografar documento \(frente\)/i);
    await captureMedia(user, /fotografar documento \(verso\)/i);

    expect(screen.getByRole("button", { name: "TROCAR FOTO DO VISITANTE" })).toHaveClass("btn-capture");
    expect(screen.getByRole("button", { name: "TROCAR DOCUMENTO (FRENTE)" })).toHaveClass("btn-capture");
    expect(screen.getByRole("button", { name: "TROCAR DOCUMENTO (VERSO)" })).toHaveClass("btn-capture");
  });

  it("campos neutros iniciam com aria-invalid false", () => {
    renderCadastro();

    expect(screen.getByLabelText(/^cpf$/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText(/nome completo/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText(/empresa/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/nome completo .*obrigat.rio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/telefone inv.lido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/empresa .*obrigat.ria/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fotografe o visitante/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fotografe a frente do documento/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fotografe o verso do documento/i)).not.toBeInTheDocument();
  });

  it("mostra mensagem de CPF obrigatorio apos tentativa de envio", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.click(getCpfInput());
    await user.keyboard("{Enter}");

    expect(await screen.findAllByText("Informe o CPF.")).toHaveLength(2);
    expect(getCpfInput()).toHaveAccessibleDescription(/Informe o CPF\./);
  });

  it("nao mostra erros prematuros nos campos ao iniciar interacao", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(screen.getByLabelText(/nome completo/i), "Ma");
    await user.type(screen.getByLabelText(/telefone/i), "45");
    await user.type(screen.getByLabelText(/empresa/i), "D");

    expect(screen.queryByText(/nome completo .*obrigat.rio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/telefone inv.lido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/empresa .*obrigat.ria/i)).not.toBeInTheDocument();
  });

  it("diferencia mensagens obrigatorias e curtas apos submit", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.type(screen.getByLabelText(/nome completo/i), "Ma");
    await user.type(screen.getByLabelText(/telefone/i), "45");
    await user.type(screen.getByLabelText(/empresa/i), "D");
    await user.click(getCpfInput());
    await user.keyboard("{Enter}");

    expect(await screen.findAllByText("Digite o nome completo com pelo menos 3 caracteres.")).toHaveLength(2);
    expect(screen.getAllByText("Digite um telefone com DDD.")).toHaveLength(2);
    expect(screen.getAllByText("Digite o nome da empresa com pelo menos 2 caracteres.")).toHaveLength(2);
  });

  it("nao mostra erro enquanto um CPF incompleto e digitado", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "123");

    expect(screen.queryByText("Digite um CPF válido.")).not.toBeInTheDocument();
    expect(getCpfBadge()).not.toHaveClass("bad");
    expect(getCpfInput()).toHaveAttribute("aria-invalid", "false");
  });

  it("mostra erro ao sair do campo com CPF preenchido e invalido", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "11111111111");
    await user.tab();

    expect(screen.getAllByText("Digite um CPF válido.")).toHaveLength(1);
    expect(cpfInput).toHaveAttribute("aria-invalid", "true");
    expect(cpfInput).toHaveAccessibleDescription("Digite um CPF válido.");
    expect(getCpfBadge(cpfInput)).toHaveClass("bad");
  });

  it("mostra feedback positivo para CPF completo e valido", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "52998224725");

    expect(screen.getByText(/cpf válido/i)).toBeInTheDocument();
    expect(screen.queryByText("Digite um CPF válido.")).not.toBeInTheDocument();
    expect(cpfInput).toHaveAttribute("aria-invalid", "false");
    expect(cpfInput).toHaveAccessibleDescription("CPF válido");
    expect(getCpfBadge(cpfInput)).toHaveClass("ok");
  });

  it("remove o erro antigo quando o CPF invalido e corrigido", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "11111111111");
    await user.tab();
    expect(screen.getAllByText("Digite um CPF válido.")).toHaveLength(1);

    await user.click(cpfInput);
    await user.clear(cpfInput);
    await user.type(cpfInput, "52998224725");

    expect(screen.queryByText("Digite um CPF válido.")).not.toBeInTheDocument();
    expect(screen.getByText(/cpf válido/i)).toBeInTheDocument();
    expect(getCpfBadge(cpfInput)).toHaveClass("ok");
  });

  it("apagar o CPF remove o estado positivo antigo", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "52998224725");
    expect(screen.getByText(/cpf válido/i)).toBeInTheDocument();

    await user.clear(cpfInput);

    expect(screen.queryByText(/cpf válido/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Digite um CPF válido.")).not.toBeInTheDocument();
    expect(getCpfBadge(cpfInput)).not.toHaveClass("ok");
    expect(getCpfBadge(cpfInput)).not.toHaveClass("bad");
  });

  it("enter com CPF invalido continua impedindo o envio", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "11111111111");
    await user.keyboard("{Enter}");

    expect(screen.getAllByText("Digite um CPF válido.")).toHaveLength(2);
    await waitFor(() => expect(api.post).not.toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/cadastro");
  });

  it("preserva disabled nos botoes de captura durante salvamento sem mudar o submit", async () => {
    const user = userEvent.setup();
    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));
    renderCadastro();

    await fillValidCadastro(user);

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /salvando/i })).toBeDisabled());
    for (const button of [
      screen.getByRole("button", { name: /trocar foto do visitante/i }),
      screen.getByRole("button", { name: /trocar documento \(frente\)/i }),
      screen.getByRole("button", { name: /trocar documento \(verso\)/i }),
    ]) {
      expect(button).toBeDisabled();
      expect(button).toHaveClass("btn-capture");
    }

    resolvePost({ status: 201, data: { id: 10 } });
    await waitFor(() => expect(screen.getByText("Checkin destino")).toBeInTheDocument());
  });

  it("mostra status visual e acessivel durante o salvamento sem duplicar nome acessivel", async () => {
    const user = userEvent.setup();
    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));
    const { container } = renderCadastro();

    await fillValidCadastro(user);
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Salvando cadastro, aguarde..."));
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    expect(screen.getAllByText("Salvando cadastro, aguarde...")).toHaveLength(1);
    expect(container.querySelector(".cadastro-savingSpinner")).toHaveAttribute("aria-hidden", "true");

    resolvePost({ status: 201, data: { id: 10 } });
    await waitFor(() => expect(screen.getByText("Checkin destino")).toBeInTheDocument());
  });

  it("impede clique duplo de disparar dois submits durante salvamento", async () => {
    const user = userEvent.setup();
    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));
    renderCadastro();

    await fillValidCadastro(user);
    await user.dblClick(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();

    resolvePost({ data: { id: 10 } });
    await waitFor(() => expect(screen.getByText("Checkin destino")).toBeInTheDocument());
  });

  it("remove mensagem e spinner apos erro e mantem a mensagem de erro atual", async () => {
    const user = userEvent.setup();
    let rejectPost;
    api.post.mockReturnValueOnce(new Promise((resolve, reject) => {
      rejectPost = reject;
    }));
    const { container } = renderCadastro();

    await fillValidCadastro(user);
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    expect(await screen.findByText("Salvando cadastro, aguarde...")).toBeInTheDocument();
    rejectPost({ response: { data: { message: "Falha controlada" } } });
    expect(await screen.findByText("Não foi possível concluir o cadastro. Tente novamente em alguns instantes.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Salvando cadastro, aguarde...")).not.toBeInTheDocument());
    expect(container.querySelector(".cadastro-savingSpinner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).not.toBeDisabled();
  });

  it("volta a exibir o processamento em novo submit apos erro", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce({ response: { data: { message: "Falha controlada" } } });
    let resolveSecondPost;
    api.post.mockReturnValueOnce(new Promise((resolve) => {
      resolveSecondPost = resolve;
    }));
    renderCadastro();

    await fillValidCadastro(user);
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    expect(await screen.findByText("Não foi possível concluir o cadastro. Tente novamente em alguns instantes.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Salvando cadastro, aguarde...")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível concluir o cadastro. Tente novamente em alguns instantes.")).not.toBeInTheDocument();

    resolveSecondPost({ data: { id: 10 } });
    await waitFor(() => expect(screen.getByText("Checkin destino")).toBeInTheDocument());
  });

  it("vincula o alerta geral ao primeiro campo invalido apos tentativa de cadastro", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");

    const nameInput = screen.getByLabelText(/nome completo/i);
    const alert = await screen.findByRole("alert");

    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", expect.stringContaining("cadastro-name-error"));
    expect(nameInput).toHaveAttribute("aria-describedby", expect.stringContaining(alert.id));
    expect(alert).toHaveAttribute("id", "cadastro-form-alert");
    expect(alert).toHaveAttribute("tabindex", "-1");
    expect(alert).toHaveTextContent("Corrija os campos:");
    expect(within(alert).getByText("Informe o nome completo.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^cpf$/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/empresa/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("mantem alerta consolidado na ordem visual e sem termos tecnicos", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.click(getCpfInput());
    await user.keyboard("{Enter}");

    const alert = await screen.findByRole("alert");
    const items = within(alert).getAllByRole("listitem").map((item) => item.textContent);

    expect(items).toEqual([
      "Informe o CPF.",
      "Informe o nome completo.",
      "Informe o telefone.",
      "Informe a empresa.",
      "Fotografe o visitante.",
      "Fotografe a frente do documento.",
      "Fotografe o verso do documento.",
    ]);
    expect(alert).not.toHaveTextContent(/photo|documentFront|documentBack|multipart|MIME|buffer/i);
  });

  it("executa scroll apenas apos tentativa de submit invalido", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    renderCadastro();

    expect(scrollIntoView).not.toHaveBeenCalled();

    await user.click(getCpfInput());
    await user.keyboard("{Enter}");
    await screen.findByRole("alert");

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("mostra erros inline por campo e move o foco para o alerta apos submit", async () => {
    const user = userEvent.setup();
    const { container } = renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");

    const nameInput = screen.getByLabelText(/nome completo/i);
    const phoneInput = screen.getByLabelText(/telefone/i);
    const companyInput = screen.getByLabelText(/empresa/i);

    const alert = await screen.findByRole("alert");
    expect(container.querySelector("#cadastro-name-error")).toHaveTextContent("Informe o nome completo.");
    expect(container.querySelector("#cadastro-phone-error")).toHaveTextContent("Informe o telefone.");
    expect(container.querySelector("#cadastro-company-error")).toHaveTextContent("Informe a empresa.");
    expect(alert).toHaveFocus();
    expect(nameInput).toHaveAttribute("aria-describedby", expect.stringContaining("cadastro-name-error"));
    expect(phoneInput).toHaveAttribute("aria-describedby", "cadastro-phone-error");
    expect(companyInput).toHaveAttribute("aria-describedby", "cadastro-company-error");
  });

  it("mostra erros inline separados para foto, frente e verso ausentes", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");

    await screen.findByRole("alert");
    const photoError = document.querySelector("#cadastro-photo-error");
    const frontError = document.querySelector("#cadastro-doc-front-error");
    const backError = document.querySelector("#cadastro-doc-back-error");

    expect(photoError).toHaveAttribute("id", "cadastro-photo-error");
    expect(photoError).toHaveTextContent("Fotografe o visitante.");
    expect(frontError).toHaveAttribute("id", "cadastro-doc-front-error");
    expect(frontError).toHaveTextContent("Fotografe a frente do documento.");
    expect(backError).toHaveAttribute("id", "cadastro-doc-back-error");
    expect(backError).toHaveTextContent("Fotografe o verso do documento.");
    expect(screen.getByRole("button", { name: /tirar foto do visitante/i })).toHaveAccessibleDescription(
      "Fotografe o visitante."
    );
    expect(screen.getByRole("button", { name: /fotografar documento \(frente\)/i })).toHaveAccessibleDescription(
      "Fotografe a frente do documento."
    );
    expect(screen.getByRole("button", { name: /fotografar documento \(verso\)/i })).toHaveAccessibleDescription(
      "Fotografe o verso do documento."
    );
  });

  it("remove somente o erro do campo corrigido", async () => {
    const user = userEvent.setup();
    const { container } = renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe o nome completo.");
    expect(container.querySelector("#cadastro-phone-error")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nome completo/i), "Maria Silva");

    expect(container.querySelector("#cadastro-name-error")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nome completo/i)).toHaveAttribute("aria-invalid", "false");
    expect(container.querySelector("#cadastro-phone-error")).toBeInTheDocument();
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("remove somente o erro da midia capturada", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");
    await screen.findByRole("alert");
    expect(document.querySelector("#cadastro-photo-error")).toHaveTextContent("Fotografe o visitante.");
    expect(document.querySelector("#cadastro-doc-back-error")).toHaveTextContent("Fotografe o verso do documento.");

    await captureMedia(user, /tirar foto do visitante/i);

    expect(document.querySelector("#cadastro-photo-error")).not.toBeInTheDocument();
    expect(screen.getByText("Foto capturada")).toBeInTheDocument();
    expect(document.querySelector("#cadastro-doc-front-error")).toHaveTextContent("Fotografe a frente do documento.");
    expect(document.querySelector("#cadastro-doc-back-error")).toHaveTextContent("Fotografe o verso do documento.");
  });

  it("mantem ordem natural de tab a partir do CPF", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.click(cpfInput);
    await user.tab();

    expect(screen.getByLabelText(/nome completo/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/telefone/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/empresa/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /tirar foto do visitante/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /fotografar documento \(frente\)/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /fotografar documento \(verso\)/i })).toHaveFocus();
  });

  it("mantem os demais campos editaveis no fluxo de cadastro", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(screen.getByPlaceholderText(/joão da silva/i), "Maria Silva");
    await user.type(screen.getByPlaceholderText("(45) 99999-9999"), "45999999999");
    await user.type(screen.getByPlaceholderText(/transportadora x/i), "Dimebras");

    expect(screen.getByPlaceholderText(/joão da silva/i)).toHaveValue("Maria Silva");
    expect(screen.getByPlaceholderText("(45) 99999-9999")).toHaveValue("(45) 99999-9999");
    expect(screen.getByPlaceholderText(/transportadora x/i)).toHaveValue("Dimebras");
  });

  it.each([
    [/tirar foto do visitante/i, "Fotografar visitante"],
    [/fotografar documento \(frente\)/i, "Fotografar documento - frente"],
    [/fotografar documento \(verso\)/i, "Fotografar documento - verso"],
  ])("abre a camera com dialog nomeado e devolve foco para o acionador correto", async (buttonName, dialogName) => {
    const user = userEvent.setup();
    renderCadastro();

    const trigger = screen.getByRole("button", { name: buttonName });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: dialogName });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Fechar câmera" })).toHaveClass(
      "cam-actionButton",
      "cam-actionButton--secondary"
    );
    expect(screen.getByRole("button", { name: "Capturar" })).toHaveClass(
      "cam-actionButton",
      "cam-actionButton--primary"
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Fechar câmera" })).toHaveFocus());

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("envia o FormData transacional depois da reorganizacao visual", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await fillValidCadastro(user);

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/visitors/with-files", expect.any(FormData)));
    const formData = api.post.mock.calls[0][1];
    expect(api.post.mock.calls[0]).toHaveLength(2);
    expect(Array.from(formData.keys())).toEqual([
      "name",
      "cpf",
      "phone",
      "company",
      "photo",
      "documentFront",
      "documentBack",
    ]);
    expect(formData.get("name")).toBe("Maria Silva");
    expect(formData.get("cpf")).toBe("52998224725");
    expect(formData.get("phone")).toBe("45999999999");
    expect(formData.get("company")).toBe("Dimebras");
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("impede que o foco escape para a pagina atras da camera", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.click(screen.getByRole("button", { name: /tirar foto do visitante/i }));
    const closeButton = await screen.findByRole("button", { name: "Fechar câmera" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.tab();

    expect(closeButton).toHaveFocus();
    expect(screen.getByLabelText(/^cpf$/i)).not.toHaveFocus();
  });
});
