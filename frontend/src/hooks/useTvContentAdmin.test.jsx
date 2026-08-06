import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTvContentAdmin } from "./useTvContentAdmin";
import { getBranches } from "../services/branchService";
import { createTvContent, getTvContents } from "../services/tvContentService";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../services/session", () => ({
  getToken: vi.fn(() => "token"),
  getUser: vi.fn(() => ({ role: "ADMIN" })),
}));

vi.mock("../services/branchService", () => ({
  getBranches: vi.fn(),
}));

vi.mock("../services/tvContentService", () => ({
  createTvContent: vi.fn(),
  deleteTvContent: vi.fn(),
  getTvContents: vi.fn(),
  toggleTvContent: vi.fn(),
  updateTvContent: vi.fn(),
}));

function submitEvent() {
  return {
    preventDefault: vi.fn(),
    target: { reset: vi.fn() },
  };
}

describe("useTvContentAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBranches.mockResolvedValue({ data: [{ id: 1, name: "Matriz" }] });
    getTvContents.mockResolvedValue({ data: [] });
  });

  it("usa erros inline para validação corrigível e não dispara toast", async () => {
    const showToast = vi.fn();
    const { result } = renderHook(() => useTvContentAdmin({ confirm: vi.fn(), showToast }));

    await waitFor(() => expect(getTvContents).toHaveBeenCalled());

    await act(async () => {
      await result.current.submitUpload(submitEvent());
    });

    expect(result.current.formErrors).toEqual([
      { field: "title", message: "Informe o título da mídia." },
      { field: "file", message: "Selecione uma imagem ou um vídeo." },
      { field: "branches", message: "Selecione pelo menos uma filial." },
    ]);
    expect(showToast).not.toHaveBeenCalled();
    expect(createTvContent).not.toHaveBeenCalled();
  });

  it("mantém payload de criação e usa toast único de sucesso", async () => {
    const showToast = vi.fn();
    const file = new File(["content"], "tv.mp4", { type: "video/mp4" });
    createTvContent.mockResolvedValue({ data: { id: 1 } });
    const event = submitEvent();
    const { result } = renderHook(() => useTvContentAdmin({ confirm: vi.fn(), showToast }));

    await waitFor(() => expect(getTvContents).toHaveBeenCalled());

    act(() => {
      result.current.updateFormField("title", " Vídeo institucional ");
      result.current.updateFormField("file", file);
      result.current.updateFormField("selectedBranchIds", [1]);
    });

    await act(async () => {
      await result.current.submitUpload(event);
    });

    const formData = createTvContent.mock.calls[0][0];
    expect(formData.get("title")).toBe("Vídeo institucional");
    expect(formData.get("branchIds")).toBe("[1]");
    expect(formData.get("file")).toBe(file);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("Conteúdo criado com sucesso.");
    expect(event.target.reset).toHaveBeenCalledTimes(1);
  });
});
