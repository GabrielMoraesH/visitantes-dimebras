import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useCadastroVisitante from "./useCadastroVisitante";
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
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function wrapper(initialEntry = "/cadastro") {
  return function HookWrapper({ children }) {
    setSession("token-teste", { id: 1, username: "recepcao", role: "RECEPCAO" });

    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/cadastro"
            element={
              <>
                <LocationProbe />
                {children}
              </>
            }
          />
          <Route path="/login" element={<div>Login destino</div>} />
          <Route path="/checkin" element={<div>Checkin destino</div>} />
        </Routes>
      </MemoryRouter>
    );
  };
}

function mockObjectUrls() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((file) => `blob:${file.name}`),
  });

  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
}

function capture(result, target) {
  act(() => {
    result.current.handlers.onOpenCamera(target);
  });

  act(() => {
    result.current.camera.onCapture(new Blob(["foto"], { type: "image/jpeg" }));
  });
}

async function fillValidRegistration(result) {
  act(() => {
    result.current.handlers.onChangeCpf("52998224725");
    result.current.handlers.onChangeName("Maria Silva");
    result.current.handlers.onChangePhone("45999999999");
    result.current.handlers.onChangeCompany("Dimebras");
  });

  capture(result, "photo");
  capture(result, "docFront");
  capture(result, "docBack");

  await waitFor(() => expect(result.current.validation.formOk).toBe(true));
}

describe("useCadastroVisitante", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockObjectUrls();
    api.get.mockRejectedValue({ response: { status: 404 } });
    api.post.mockResolvedValue({ data: { id: 10 } });
    api.put.mockResolvedValue({});
    api.delete.mockResolvedValue({});
  });

  it("expoe estado inicial vazio, sem erros, sem salvamento e com camera fechada", () => {
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });

    expect(result.current.fields.cpfDisplay).toBe("");
    expect(result.current.fields.name).toBe("");
    expect(result.current.fields.phoneDisplay).toBe("");
    expect(result.current.fields.company).toBe("");
    expect(result.current.media.photo).toBeNull();
    expect(result.current.media.docFront).toBeNull();
    expect(result.current.media.docBack).toBeNull();
    expect(result.current.submission.message).toBe("");
    expect(result.current.submission.saving).toBe(false);
    expect(result.current.camera.open).toBe(false);
    expect(result.current.fields.cpfFeedback).toBe("neutral");
    expect(result.current.fields.nameError).toBe("");
    expect(result.current.media.photoError).toBe("");
  });

  it("mantem CPF incompleto neutro e mostra invalido apos blur completo", () => {
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });

    act(() => {
      result.current.handlers.onChangeCpf("123");
    });

    expect(result.current.fields.cpfDisplay).toBe("123");
    expect(result.current.fields.cpfFeedback).toBe("neutral");

    act(() => {
      result.current.handlers.onChangeCpf("11111111111");
      result.current.handlers.onCpfBlur();
    });

    expect(result.current.fields.cpfDisplay).toBe("111.111.111-11");
    expect(result.current.fields.cpfFeedback).toBe("invalid");
  });

  it("marca campos tocados e remove apenas o erro corrigido", () => {
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });

    act(() => {
      result.current.handlers.onBlurName();
      result.current.handlers.onBlurPhone();
      result.current.handlers.onBlurCompany();
    });

    expect(result.current.fields.nameError).toBe("Informe o nome completo.");
    expect(result.current.fields.phoneError).toBe("Informe o telefone.");
    expect(result.current.fields.companyError).toBe("Informe a empresa.");

    act(() => {
      result.current.handlers.onChangeName("Maria Silva");
    });

    expect(result.current.fields.nameError).toBe("");
    expect(result.current.fields.phoneError).toBe("Informe o telefone.");
    expect(result.current.fields.companyError).toBe("Informe a empresa.");
  });

  it("abre e fecha a camera, capturando a midia correta por tipo", () => {
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });

    act(() => {
      result.current.handlers.onChangeCpf("52998224725");
      result.current.handlers.onOpenCamera("photo");
    });

    expect(result.current.camera.open).toBe(true);
    expect(result.current.camera.target).toBe("photo");
    expect(result.current.camera.mode).toBe("photo");

    act(() => {
      result.current.camera.onCapture(new Blob(["foto"], { type: "image/jpeg" }));
    });

    expect(result.current.camera.open).toBe(false);
    expect(result.current.media.photo.name).toBe("52998224725-foto.jpg");
    expect(result.current.media.docFront).toBeNull();

    capture(result, "docFront");
    capture(result, "docBack");

    expect(result.current.media.docFront.name).toBe("52998224725-doc-frente.jpg");
    expect(result.current.media.docBack.name).toBe("52998224725-doc-verso.jpg");
  });

  it("submit invalido nao chama API, ativa erros e foca o alerta consolidado", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    result.current.refs.formAlertRef.current = { focus, scrollIntoView };

    await act(async () => {
      await result.current.handlers.onSubmit();
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.submission.message).toBe("Informe o CPF.");
    expect(result.current.fields.cpfFeedback).toBe("invalid");
    expect(result.current.media.photoError).toBe("Fotografe o visitante.");

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    vi.useRealTimers();
  });

  it("submit valido usa endpoint transacional, bloqueia duplicidade, navega e finaliza saving", async () => {
    let resolvePost;
    api.post.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));

    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    await fillValidRegistration(result);

    let firstSubmit;
    await act(async () => {
      firstSubmit = result.current.handlers.onSubmit();
      await result.current.handlers.onSubmit();
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe("/visitors/with-files");
    expect(result.current.submission.saving).toBe(true);

    await act(async () => {
      resolvePost({ status: 201, data: { id: 10 } });
      await firstSubmit;
    });

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
    expect(formData.get("photo")).toBe(result.current.media.photo);
    expect(formData.get("documentFront")).toBe(result.current.media.docFront);
    expect(formData.get("documentBack")).toBe(result.current.media.docBack);
    expect(api.post.mock.calls.map(([url]) => url)).not.toContain("/visitors");
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText("Checkin destino")).toBeInTheDocument();
    expect(result.current.submission.saving).toBe(false);
  });

  it("409 busca visitante existente, envia apenas arquivos e navega sem alterar dados textuais", async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { code: "VISITOR_CPF_CONFLICT" } },
    });
    api.get.mockResolvedValueOnce({ data: { id: 55, name: "Nome Antigo", phone: "1111111111", company: "Antiga" } });
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    await fillValidRegistration(result);

    await act(async () => {
      await result.current.handlers.onSubmit();
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe("/visitors/with-files");
    expect(api.post.mock.calls.map(([url]) => url)).not.toContain("/visitors");
    expect(api.get).toHaveBeenCalledWith("/visitors/by-cpf/52998224725");
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledWith(
      "/visitors/55/files",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    expect(Array.from(api.put.mock.calls[0][1].keys())).toEqual(["photo", "documentFront", "documentBack"]);
    expect(api.put.mock.calls[0][1].has("name")).toBe(false);
    expect(api.put.mock.calls[0][1].has("phone")).toBe(false);
    expect(api.put.mock.calls[0][1].has("company")).toBe(false);
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText("Checkin destino")).toBeInTheDocument();
    expect(result.current.submission.saving).toBe(false);
  });

  it("409 informa que os documentos do visitante existente estao sendo atualizados", async () => {
    let resolveGet;
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { code: "VISITOR_CPF_CONFLICT" } },
    });
    api.get.mockReturnValueOnce(new Promise((resolve) => {
      resolveGet = resolve;
    }));
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    await fillValidRegistration(result);

    await act(async () => {
      result.current.handlers.onSubmit();
    });

    expect(result.current.submission.message).toBe("CPF já cadastrado. Atualizando os documentos do visitante.");

    await act(async () => {
      resolveGet({ data: { id: 55 } });
    });
  });

  it.each([
    [{ response: { status: 400, data: { message: "Dados invalidos" } } }, "Não foi possível concluir o cadastro. Tente novamente em alguns instantes."],
    [{ response: { status: 401, data: { message: "Nao autorizado" } } }, ""],
    [{ response: { status: 403, data: { message: "Acesso negado" } } }, "Você não tem permissão para cadastrar visitantes nesta filial."],
    [{ response: { status: 404 } }, "Não foi possível concluir o cadastro. Tente novamente em alguns instantes."],
    [{ response: { status: 405 } }, "Não foi possível concluir o cadastro. Tente novamente em alguns instantes."],
    [{ response: { status: 413 } }, "A imagem excede o tamanho permitido. Capture outra imagem."],
    [{ response: { status: 415 } }, "Formato de imagem não permitido. Capture a imagem novamente."],
    [{ response: { status: 422, data: { message: "Validacao falhou" } } }, "Não foi possível concluir o cadastro. Tente novamente em alguns instantes."],
    [{ response: { status: 500, data: { message: "Erro interno" } } }, "Não foi possível concluir o cadastro. Tente novamente em alguns instantes."],
    [{ request: {} }, "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."],
    [{ code: "ECONNABORTED", message: "timeout" }, "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."],
    [{ response: { data: { code: "VISITOR_WITH_FILES_ENDPOINT_NOT_FOUND" } } }, "Não foi possível concluir o cadastro. Tente novamente em alguns instantes."],
  ])("nao ativa fluxo alternativo para erro %o", async (submitError, expectedMessage) => {
    api.post.mockRejectedValueOnce(submitError);
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    await fillValidRegistration(result);

    await act(async () => {
      await result.current.handlers.onSubmit();
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe("/visitors/with-files");
    expect(api.post.mock.calls.map(([url]) => url)).not.toContain("/visitors");
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(result.current.submission.message).toBe(expectedMessage);
    expect(result.current.submission.saving).toBe(false);
  });

  it("erro da API usa mensagem amigavel e preserva dados preenchidos", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { message: "Falha controlada" } } });
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    await fillValidRegistration(result);

    await act(async () => {
      await result.current.handlers.onSubmit();
    });

    expect(result.current.submission.message).toBe("Não foi possível concluir o cadastro. Tente novamente em alguns instantes.");
    expect(result.current.fields.name).toBe("Maria Silva");
    expect(result.current.media.photo).not.toBeNull();
    expect(result.current.submission.saving).toBe(false);
  });
});
