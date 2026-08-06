import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TvContentForm from "./TvContentForm";

const branches = [{ id: 1, name: "Matriz" }];

function renderForm(errors = []) {
  return render(
    <TvContentForm
      branches={branches}
      errors={errors}
      form={{
        title: "",
        file: null,
        order: "0",
        isActive: true,
        selectedBranchIds: [],
      }}
      msg=""
      onChange={vi.fn()}
      onSubmit={(event) => event.preventDefault()}
      uploading={false}
    />
  );
}

describe("TvContentForm", () => {
  it("exibe alerta consolidado, erros inline iguais e foco no alerta", () => {
    renderForm([
      { field: "title", message: "Informe o título da mídia." },
      { field: "file", message: "Selecione uma imagem ou um vídeo." },
      { field: "branches", message: "Selecione pelo menos uma filial." },
    ]);

    const alert = screen.getByRole("alert");
    const messages = [
      "Informe o título da mídia.",
      "Selecione uma imagem ou um vídeo.",
      "Selecione pelo menos uma filial.",
    ];

    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent("Corrija os campos:");
    messages.forEach((message) => {
      expect(screen.getAllByText(message)).toHaveLength(2);
    });
    expect(screen.getByLabelText("Título da mídia")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Mídia")).toHaveAttribute("aria-invalid", "true");
  });

  it("exibe loading de criação sem caixa alta semântica", () => {
    render(
      <TvContentForm
        branches={branches}
        form={{
          title: "Vídeo",
          file: null,
          order: "0",
          isActive: true,
          selectedBranchIds: [1],
        }}
        msg=""
        onChange={vi.fn()}
        onSubmit={(event) => event.preventDefault()}
        uploading
      />
    );

    expect(screen.getByRole("button", { name: "Enviando conteúdo..." })).toBeDisabled();
  });
});
