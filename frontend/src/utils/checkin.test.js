import { describe, expect, it } from "vitest";
import {
  formatCPF,
  formatDateTime,
  formatPhone,
  isOlderThan6Months,
  onlyDigits,
  uniqueFieldErrorMessages,
  uploadErrorMessage,
} from "./checkin";

describe("checkin utils", () => {
  it("normaliza e formata CPF e telefone", () => {
    expect(onlyDigits("CPF 123.456.789-01")).toBe("12345678901");
    expect(formatCPF("12345678901")).toBe("123.456.789-01");
    expect(formatPhone("41999998888")).toBe("(41) 99999-8888");
    expect(formatPhone("4133334444")).toBe("(41) 3333-4444");
  });

  it("formata datas e considera datas ausentes ou inválidas como vencidas", () => {
    expect(formatDateTime("2026-07-22T09:30:00-03:00")).toContain("22/07/2026");
    expect(isOlderThan6Months("")).toBe(true);
    expect(isOlderThan6Months("data-inválida")).toBe(true);
  });

  it("preserva mensagens específicas de upload", () => {
    expect(uploadErrorMessage({ response: { status: 413 } }, "fallback")).toBe("Imagem excede o limite permitido.");
    expect(uploadErrorMessage({ response: { data: { code: "UPLOAD_INVALID_TYPE" } } }, "fallback")).toBe(
      "Imagem em formato não permitido."
    );
    expect(uploadErrorMessage({ response: { data: { message: "Mensagem API" } } }, "fallback")).toBe("Mensagem API");
    expect(uploadErrorMessage({}, "fallback")).toBe("fallback");
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
});
