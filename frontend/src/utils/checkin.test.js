import { describe, expect, it } from "vitest";
import {
  cpfSearchErrorMessage,
  formatCPF,
  formatDateTime,
  formatPhone,
  isOlderThan6Months,
  isValidCPF,
  labelGenerationErrorMessage,
  normalizeCheckinFieldErrors,
  onlyDigits,
  requiredVisitFieldErrors,
  uniqueFieldErrorMessages,
  uploadErrorMessage,
  visitorDocumentPendencies,
  visitorDocumentStatusMessage,
} from "./checkin";

describe("checkin utils", () => {
  it("normaliza, valida e formata CPF e telefone", () => {
    expect(onlyDigits("CPF 529.982.247-25")).toBe("52998224725");
    expect(formatCPF("52998224725")).toBe("529.982.247-25");
    expect(isValidCPF("52998224725")).toBe(true);
    expect(isValidCPF("11111111111")).toBe(false);
    expect(formatPhone("41999998888")).toBe("(41) 99999-8888");
    expect(formatPhone("4133334444")).toBe("(41) 3333-4444");
  });

  it("padroniza mensagens de CPF", () => {
    expect(cpfSearchErrorMessage("")).toBe("Informe o CPF.");
    expect(cpfSearchErrorMessage("11111111111")).toBe("Digite um CPF válido.");
    expect(cpfSearchErrorMessage("52998224725")).toBe("");
  });

  it("formata datas e considera datas ausentes ou inválidas como vencidas", () => {
    expect(formatDateTime("2026-07-22T09:30:00-03:00")).toContain("22/07/2026");
    expect(isOlderThan6Months("")).toBe(true);
    expect(isOlderThan6Months("data-inválida")).toBe(true);
  });

  it("preserva mensagens específicas de upload sem repassar termos técnicos", () => {
    expect(uploadErrorMessage({ response: { status: 413 } }, "fallback")).toBe("Imagem excede o limite permitido.");
    expect(uploadErrorMessage({ response: { data: { code: "UPLOAD_INVALID_TYPE" } } }, "fallback")).toBe(
      "Não foi possível utilizar esta imagem. Capture outra."
    );
    expect(uploadErrorMessage({ response: { data: { message: "photo buffer inválido" } } }, "fallback")).toBe("fallback");
    expect(uploadErrorMessage({}, "fallback")).toBe(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );
  });

  it("remove mensagens duplicadas de validação", () => {
    expect(
      uniqueFieldErrorMessages([
        { message: "Campo obrigatorio" },
        { message: "Campo obrigatorio" },
        { message: "" },
        null,
      ])
    ).toEqual(["Campo obrigatorio"]);
  });

  it("deriva pendências de documentos na ordem frente e verso", () => {
    expect(
      visitorDocumentPendencies({
        documentFrontUpdatedAt: null,
        documentBackUpdatedAt: "2025-01-01T10:00:00-03:00",
      }).map((item) => item.message)
    ).toEqual([
      "Fotografe a frente do documento.",
      "O verso do documento está expirado. Fotografe-o novamente.",
    ]);
  });

  it("gera mensagem inicial específica para documentos pendentes", () => {
    const pendencies = visitorDocumentPendencies({
      documentFrontUpdatedAt: "2025-01-01T10:00:00-03:00",
      documentBackUpdatedAt: "2025-01-01T10:00:00-03:00",
    });

    expect(visitorDocumentStatusMessage(pendencies)).toBe(
      "Os documentos deste visitante estão expirados. Atualize a frente e o verso para continuar."
    );
  });

  it("valida campos obrigatórios da visita antes de consolidar com documentos", () => {
    expect(requiredVisitFieldErrors({ attendedBy: "", serviceType: "  " }).map((item) => item.message)).toEqual([
      "Informe com quem o visitante veio falar.",
      "Informe o motivo da visita.",
    ]);
  });

  it("normaliza detalhes da API para mensagens oficiais", () => {
    expect(
      normalizeCheckinFieldErrors([
        { path: "documentBack", message: "documentBack buffer inválido" },
        { path: "company", message: "Campo obrigatório" },
        { path: "attendedBy", message: "required" },
      ]).map((item) => item.message)
    ).toEqual([
      "Informe com quem o visitante veio falar.",
      "Informe a empresa.",
      "Fotografe o verso do documento.",
    ]);
  });

  it("padroniza erros de etiqueta", () => {
    expect(labelGenerationErrorMessage(new Error("Network Error"))).toBe(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );
    expect(labelGenerationErrorMessage({ response: { data: { message: "token JWT stack" } } })).toBe(
      "Não foi possível gerar a etiqueta. Tente novamente em alguns instantes."
    );
    expect(
      labelGenerationErrorMessage({
        response: { data: { code: "VISITOR_OPEN_VISIT_CONFLICT", message: "visita em andamento" } },
      })
    ).toBe("Este visitante já possui uma visita em aberto nesta filial.");
  });
});
