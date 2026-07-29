import { act, renderHook, waitFor } from "@testing-library/react";
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

    expect(result.current.fields.nameError).toBe("Campo obrigatorio: nome completo.");
    expect(result.current.fields.phoneError).toBe("Campo invalido: telefone (minimo 10 digitos).");
    expect(result.current.fields.companyError).toBe("Campo obrigatorio: empresa.");

    act(() => {
      result.current.handlers.onChangeName("Maria Silva");
    });

    expect(result.current.fields.nameError).toBe("");
    expect(result.current.fields.phoneError).toBe("Campo invalido: telefone (minimo 10 digitos).");
    expect(result.current.fields.companyError).toBe("Campo obrigatorio: empresa.");
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

  it("submit invalido nao chama API, ativa erros e foca o primeiro invalido", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    const focus = vi.fn();
    result.current.refs.cpfInputRef.current = { focus };

    await act(async () => {
      await result.current.handlers.onSubmit();
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.submission.message).toBe("CPF inválido.");
    expect(result.current.fields.cpfFeedback).toBe("invalid");
    expect(result.current.media.photoError).toBe("Fotografe o visitante.");

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    vi.useRealTimers();
  });

  it("submit valido preserva payload, upload, bloqueio duplicado e finalizacao do saving", async () => {
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
    expect(result.current.submission.saving).toBe(true);

    await act(async () => {
      resolvePost({ data: { id: 10 } });
      await firstSubmit;
    });

    expect(api.post).toHaveBeenCalledWith("/visitors", {
      company: "Dimebras",
      cpf: "52998224725",
      name: "Maria Silva",
      phone: "45999999999",
    });
    expect(api.put).toHaveBeenCalledWith(
      "/visitors/10/files",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    expect(result.current.submission.saving).toBe(false);
  });

  it("erro da API preserva mensagem e dados preenchidos", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { message: "Falha controlada" } } });
    const { result } = renderHook(() => useCadastroVisitante(), { wrapper: wrapper() });
    await fillValidRegistration(result);

    await act(async () => {
      await result.current.handlers.onSubmit();
    });

    expect(result.current.submission.message).toBe("Falha controlada");
    expect(result.current.fields.name).toBe("Maria Silva");
    expect(result.current.media.photo).not.toBeNull();
    expect(result.current.submission.saving).toBe(false);
  });
});
