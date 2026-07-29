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

    expect(screen.queryByText(/cpf inválido/i)).not.toBeInTheDocument();
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

  it("mantem o fluxo semantico mobile com dados, midia e salvar no final", () => {
    const { container } = renderCadastro();

    const fields = container.querySelector(".cadastro-fields");
    const media = container.querySelector(".cadastro-media");
    const submit = container.querySelector(".cadastro-submit");

    expect(fields.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(media.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fields).toContainElement(screen.getByLabelText(/^cpf$/i));
    expect(media).toContainElement(screen.getByRole("button", { name: /tirar foto do visitante/i }));
    expect(submit).toContainElement(screen.getByRole("button", { name: /salvar/i }));
    expect(submit.lastElementChild).toBe(screen.getByRole("button", { name: /salvar/i }));
  });

  it("usa o breakpoint responsivo existente para preservar desktop e reordenar mobile", () => {
    renderCadastro();
    const css = readFileSync("src/styles/cadastro.css", "utf8");

    expect(css).toContain("grid-template-areas:\n    \"media fields\"\n    \"media submit\"");
    expect(css).toContain("@media (max-width: 980px)");
    expect(css).toContain("grid-template-areas:\n      \"fields\"\n      \"media\"\n      \"submit\"");
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

  it("nao mostra erro enquanto um CPF incompleto e digitado", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "123");

    expect(screen.queryByText(/cpf inválido/i)).not.toBeInTheDocument();
    expect(getCpfBadge()).not.toHaveClass("bad");
    expect(getCpfInput()).toHaveAttribute("aria-invalid", "false");
  });

  it("mostra erro ao sair do campo com CPF preenchido e invalido", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "11111111111");
    await user.tab();

    expect(screen.getByText(/cpf inválido/i)).toBeInTheDocument();
    expect(cpfInput).toHaveAttribute("aria-invalid", "true");
    expect(cpfInput).toHaveAccessibleDescription("CPF inválido");
    expect(getCpfBadge(cpfInput)).toHaveClass("bad");
  });

  it("mostra feedback positivo para CPF completo e valido", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "52998224725");

    expect(screen.getByText(/cpf válido/i)).toBeInTheDocument();
    expect(screen.queryByText(/cpf inválido/i)).not.toBeInTheDocument();
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
    expect(screen.getByText(/cpf inválido/i)).toBeInTheDocument();

    await user.click(cpfInput);
    await user.clear(cpfInput);
    await user.type(cpfInput, "52998224725");

    expect(screen.queryByText(/cpf inválido/i)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/cpf inválido/i)).not.toBeInTheDocument();
    expect(getCpfBadge(cpfInput)).not.toHaveClass("ok");
    expect(getCpfBadge(cpfInput)).not.toHaveClass("bad");
  });

  it("enter com CPF invalido continua impedindo o envio", async () => {
    const user = userEvent.setup();
    renderCadastro();

    const cpfInput = getCpfInput();
    await user.type(cpfInput, "11111111111");
    await user.keyboard("{Enter}");

    expect(screen.getAllByText(/cpf inválido/i)).toHaveLength(2);
    await waitFor(() => expect(api.post).not.toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /salvar/i })).toBeDisabled();
    expect(screen.getByTestId("location")).toHaveTextContent("/cadastro");
  });

  it("preserva disabled nos botoes de captura durante salvamento sem mudar o submit", async () => {
    const user = userEvent.setup();
    let resolvePut;
    api.put.mockReturnValue(new Promise((resolve) => {
      resolvePut = resolve;
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

    resolvePut({});
    await waitFor(() => expect(screen.getByText("Checkin destino")).toBeInTheDocument());
  });

  it("mostra status visual e acessivel durante o salvamento sem duplicar nome acessivel", async () => {
    const user = userEvent.setup();
    let resolvePut;
    api.put.mockReturnValue(new Promise((resolve) => {
      resolvePut = resolve;
    }));
    const { container } = renderCadastro();

    await fillValidCadastro(user);
    await user.click(screen.getByRole("button", { name: /salvar/i }));

    const status = await screen.findByRole("status");
    await waitFor(() => expect(status).toHaveTextContent("Salvando cadastro, aguarde..."));
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "SALVANDO..." })).toBeDisabled();
    expect(screen.getAllByText("Salvando cadastro, aguarde...")).toHaveLength(1);
    expect(container.querySelector(".cadastro-savingSpinner")).toHaveAttribute("aria-hidden", "true");

    resolvePut({});
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
    expect(screen.getByRole("button", { name: "SALVANDO..." })).toBeDisabled();

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
    expect(await screen.findByText("Falha controlada")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Salvando cadastro, aguarde...")).not.toBeInTheDocument());
    expect(container.querySelector(".cadastro-savingSpinner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SALVAR" })).not.toBeDisabled();
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
    expect(await screen.findByText("Falha controlada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SALVAR" }));

    expect(await screen.findByText("Salvando cadastro, aguarde...")).toBeInTheDocument();
    expect(screen.queryByText("Falha controlada")).not.toBeInTheDocument();

    resolveSecondPost({ data: { id: 10 } });
    await waitFor(() => expect(screen.getByText("Checkin destino")).toBeInTheDocument());
  });

  it("vincula o alerta geral ao primeiro campo invalido apos tentativa de cadastro", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");

    const nameInput = screen.getByLabelText(/nome completo/i);
    const alert = await screen.findByText(/nome completo .*obrigat.rio/i);

    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", expect.stringContaining("cadastro-name-error"));
    expect(nameInput).toHaveAttribute("aria-describedby", expect.stringContaining(alert.id));
    expect(alert).toHaveAttribute("id", "cadastro-form-alert");
    expect(screen.getByLabelText(/^cpf$/i)).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/empresa/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("mostra erros inline por campo e move o foco para o primeiro invalido apos submit", async () => {
    const user = userEvent.setup();
    const { container } = renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");

    const nameInput = screen.getByLabelText(/nome completo/i);
    const phoneInput = screen.getByLabelText(/telefone/i);
    const companyInput = screen.getByLabelText(/empresa/i);

    await screen.findByText(/nome completo .*obrigat.rio/i);
    expect(container.querySelector("#cadastro-name-error")).toHaveTextContent(/nome completo/i);
    expect(container.querySelector("#cadastro-phone-error")).toHaveTextContent(/telefone/i);
    expect(container.querySelector("#cadastro-company-error")).toHaveTextContent(/empresa/i);
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveAttribute("aria-describedby", expect.stringContaining("cadastro-name-error"));
    expect(phoneInput).toHaveAttribute("aria-describedby", "cadastro-phone-error");
    expect(companyInput).toHaveAttribute("aria-describedby", "cadastro-company-error");
  });

  it("mostra erros inline separados para foto, frente e verso ausentes", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");

    const photoError = await screen.findByText(/fotografe o visitante/i);
    const frontError = screen.getByText(/fotografe a frente do documento/i);
    const backError = screen.getByText(/fotografe o verso do documento/i);

    expect(photoError).toHaveAttribute("id", "cadastro-photo-error");
    expect(frontError).toHaveAttribute("id", "cadastro-doc-front-error");
    expect(backError).toHaveAttribute("id", "cadastro-doc-back-error");
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
    expect(await screen.findByText(/nome completo .*obrigat.rio/i)).toBeInTheDocument();
    expect(container.querySelector("#cadastro-phone-error")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nome completo/i), "Maria Silva");

    expect(screen.queryByText(/nome completo .*obrigat.rio/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nome completo/i)).toHaveAttribute("aria-invalid", "false");
    expect(container.querySelector("#cadastro-phone-error")).toBeInTheDocument();
    expect(screen.getByLabelText(/telefone/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("remove somente o erro da midia capturada", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await user.type(getCpfInput(), "52998224725");
    await user.keyboard("{Enter}");
    expect(await screen.findByText(/fotografe o visitante/i)).toBeInTheDocument();
    expect(screen.getByText(/fotografe o verso do documento/i)).toBeInTheDocument();

    await captureMedia(user, /tirar foto do visitante/i);

    expect(screen.queryByText(/fotografe o visitante/i)).not.toBeInTheDocument();
    expect(screen.getByText("Foto capturada")).toBeInTheDocument();
    expect(screen.getByText(/fotografe a frente do documento/i)).toBeInTheDocument();
    expect(screen.getByText(/fotografe o verso do documento/i)).toBeInTheDocument();
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

  it("continua enviando o mesmo payload depois da reorganizacao visual", async () => {
    const user = userEvent.setup();
    renderCadastro();

    await fillValidCadastro(user);

    await user.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/visitors", {
        company: "Dimebras",
        cpf: "52998224725",
        name: "Maria Silva",
        phone: "45999999999",
      })
    );
    expect(api.put).toHaveBeenCalledWith(
      "/visitors/10/files",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
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
