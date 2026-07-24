import { describe, expect, it } from "vitest";
import {
  buildCreateTvContentFormData,
  buildEditTvContentPayload,
  deleteConfirmationForTvContent,
  editFormFromTvContent,
  sameBranchSet,
  validateCreateTvContentForm,
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

  it("keeps the current create validation messages", () => {
    const baseForm = {
      title: "Video",
      file: new File(["content"], "tv.mp4", { type: "video/mp4" }),
      order: "0",
      isActive: true,
      selectedBranchIds: [1],
    };

    expect(validateCreateTvContentForm({ ...baseForm, title: " " })).toBe(
      "Informe o tÃ­tulo da midia."
    );
    expect(validateCreateTvContentForm({ ...baseForm, file: null })).toBe("Selecione um arquivo.");
    expect(
      validateCreateTvContentForm({
        ...baseForm,
        file: new File(["content"], "tv.gif", { type: "image/gif" }),
      })
    ).toBe("Use JPG, PNG, WEBP, MP4 ou WEBM.");
    expect(validateCreateTvContentForm({ ...baseForm, selectedBranchIds: [] })).toBe(
      "Selecione pelo menos uma filial."
    );
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

  it("keeps the delete confirmation copy and danger type", () => {
    expect(deleteConfirmationForTvContent({ title: "Campanha" })).toEqual({
      title: "Excluir conteúdo",
      message: 'Deseja excluir "Campanha"? O arquivo físico também será removido quando possível.',
      confirmText: "Excluir",
      cancelText: "Cancelar",
      type: "danger",
    });
  });
});
