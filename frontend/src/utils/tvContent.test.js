import { describe, expect, it } from "vitest";
import {
  buildCreateTvContentFormData,
  buildEditTvContentPayload,
  deleteConfirmationForTvContent,
  editFormFromTvContent,
  formatTvContentDateTime,
  formatTvContentTitle,
  sameBranchSet,
  TV_MAX_FILE_SIZE,
  uploadErrorMessage,
  validateCreateTvContentFields,
  validateCreateTvContentForm,
  validateEditTvContentFields,
  validateEditTvContentForm,
} from "./tvContent";

function expectSingleFileEntry(formData, file) {
  const fileEntries = [...formData.entries()].filter(([, value]) => value instanceof File);

  expect(fileEntries).toHaveLength(1);
  expect(fileEntries[0]).toEqual(["file", file]);
}

describe("tvContent utils", () => {
  it("validates and builds create FormData without changing field names", () => {
    const file = new File(["content"], "tv.webp", { type: "image/webp" });
    const form = {
      title: "  Institucional  ",
      file,
      order: "2",
      isActive: false,
      selectedBranchIds: [1, 3],
    };

    expect(validateCreateTvContentForm(form)).toBe("");

    const formData = buildCreateTvContentFormData(form);
    expect(formData.get("title")).toBe("Institucional");
    expect(formData.get("order")).toBe("2");
    expect(formData.get("isActive")).toBe("false");
    expect(formData.get("branchIds")).toBe("[1,3]");
    expect(formData.get("file")).toBe(file);
    expectSingleFileEntry(formData, file);
  });

  it.each([
    ["IMAGE", new File(["image"], "tv.webp", { type: "image/webp" })],
    ["VIDEO", new File(["video"], "tv.mp4", { type: "video/mp4" })],
  ])("builds %s multipart with exactly one File", (type, file) => {
    const formData = buildCreateTvContentFormData({
      title: type,
      file,
      order: "1",
      isActive: true,
      selectedBranchIds: [1],
    });

    expectSingleFileEntry(formData, file);
  });

  it("padroniza mensagens de validação da criação", () => {
    const baseForm = {
      title: "Vídeo",
      file: new File(["content"], "tv.mp4", { type: "video/mp4" }),
      order: "0",
      isActive: true,
      selectedBranchIds: [1],
    };

    expect(validateCreateTvContentForm({ ...baseForm, title: " " })).toBe("Informe o título da mídia.");
    expect(validateCreateTvContentForm({ ...baseForm, file: null })).toBe(
      "Selecione uma imagem ou um vídeo."
    );
    expect(
      validateCreateTvContentForm({
        ...baseForm,
        file: new File(["content"], "tv.gif", { type: "image/gif" }),
      })
    ).toBe("Formato de arquivo não permitido.");
    expect(validateCreateTvContentForm({ ...baseForm, selectedBranchIds: [] })).toBe(
      "Selecione pelo menos uma filial."
    );
  });

  it("retorna erros de criação na ordem do alerta consolidado", () => {
    expect(
      validateCreateTvContentFields({
        title: " ",
        file: null,
        order: "0",
        isActive: true,
        selectedBranchIds: [],
      })
    ).toEqual([
      { field: "title", message: "Informe o título da mídia." },
      { field: "file", message: "Selecione uma imagem ou um vídeo." },
      { field: "branches", message: "Selecione pelo menos uma filial." },
    ]);
  });

  it("padroniza mídia muito grande", () => {
    const oversizedFile = new File(["content"], "tv.mp4", { type: "video/mp4" });
    Object.defineProperty(oversizedFile, "size", { value: TV_MAX_FILE_SIZE + 1 });

    expect(
      validateCreateTvContentFields({
        title: "Vídeo",
        file: oversizedFile,
        order: "0",
        isActive: true,
        selectedBranchIds: [1],
      })
    ).toEqual([{ field: "file", message: "A mídia excede o tamanho permitido." }]);
  });

  it("maps edit form and payload preserving API contract values", () => {
    const editForm = editFormFromTvContent({
      id: 9,
      title: "Atual",
      order: 4,
      isActive: true,
      branches: [{ id: "2" }, { id: 5 }],
    });

    expect(editForm).toEqual({
      id: 9,
      title: "Atual",
      order: "4",
      isActive: true,
      branchIds: [2, 5],
    });
    expect(validateEditTvContentForm(editForm)).toBe("");
    expect(validateEditTvContentFields({ ...editForm, title: " ", branchIds: [] })).toEqual([
      { field: "title", message: "Informe o título da mídia." },
      { field: "branches", message: "Selecione pelo menos uma filial." },
    ]);
    expect(buildEditTvContentPayload({ ...editForm, title: "  Novo  " })).toEqual({
      title: "Novo",
      order: 4,
      isActive: true,
      branchIds: [2, 5],
    });
  });

  it("detects all selected branches using numeric comparison", () => {
    expect(
      sameBranchSet(["1", 2], [
        { id: 1, name: "A" },
        { id: "2", name: "B" },
      ])
    ).toBe(true);
  });

  it("padroniza confirmação de exclusão e mantém tipo danger", () => {
    expect(deleteConfirmationForTvContent({ title: "Campanha" })).toEqual({
      title: "Excluir conteúdo",
      message: "Tem certeza de que deseja excluir este conteúdo? Esta ação não poderá ser desfeita.",
      confirmText: "Excluir conteúdo",
      cancelText: "Cancelar",
      type: "danger",
    });
  });

  it("padroniza erros HTTP de upload sem expor detalhes técnicos", () => {
    expect(uploadErrorMessage({}, "fallback")).toBe(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );
    expect(uploadErrorMessage({ response: { status: 413, data: {} } }, "fallback")).toBe(
      "A mídia excede o tamanho permitido. Selecione outro arquivo."
    );
    expect(uploadErrorMessage({ response: { status: 415, data: {} } }, "fallback")).toBe(
      "Formato de arquivo não permitido. Envie uma imagem ou um vídeo compatível."
    );
  });

  it("formats TV content date and time parts for the admin table", () => {
    expect(formatTvContentDateTime("2026-07-24T13:24:43")).toEqual({
      date: "24/07/2026",
      time: "13:24",
      full: "24/07/2026 13:24:43",
    });
  });

  it("keeps invalid TV content dates as fallback", () => {
    expect(formatTvContentDateTime("invalid-date")).toEqual({
      date: "-",
      time: "",
      full: "-",
    });
  });

  it("formats TV content titles using a 20 character visible limit", () => {
    expect(formatTvContentTitle("Foto institucional")).toBe("Foto institucional");
    expect(formatTvContentTitle("12345678901234567890")).toBe("12345678901234567890");
    expect(formatTvContentTitle("123456789012345678901")).toBe("12345678901234567890...");
  });

  it("keeps the current empty title fallback for the admin table", () => {
    expect(formatTvContentTitle("")).toBe("");
    expect(formatTvContentTitle(null)).toBe("");
    expect(formatTvContentTitle(undefined)).toBe("");
  });
});
