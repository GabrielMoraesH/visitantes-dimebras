import { describe, expect, it } from "vitest";
import {
  buildHistoryParams,
  formatHistoryDate,
  formatHistoryDateParts,
  hasHistoryFilters,
  historyLoadErrorMessage,
  normalizeBranches,
  normalizeHistoryItems,
  onlyDigits,
} from "./history";

describe("history utils", () => {
  it("normaliza CPF e monta os parâmetros da busca de histórico", () => {
    const params = buildHistoryParams(
      {
        cpf: "123.456.789-00",
        status: "open",
        branchName: "Dimebras PR",
        date: "2026-07-22",
      },
      2,
      25
    );

    expect(params.toString()).toBe(
      "cpf=12345678900&status=open&branchName=Dimebras+PR&date=2026-07-22&page=2&limit=25"
    );
    expect(onlyDigits("a1-b2.c3")).toBe("123");
  });

  it("omite filtros não selecionados sem alterar paginação", () => {
    const params = buildHistoryParams(
      {
        cpf: "",
        status: "all",
        branchName: "all",
        date: "",
      },
      1,
      10
    );

    expect(params.toString()).toBe("page=1&limit=10");
  });

  it("identifica filtros ativos sem expor nomes técnicos", () => {
    expect(hasHistoryFilters({ cpf: "", status: "all", branchName: "all", date: "" })).toBe(false);
    expect(hasHistoryFilters({ cpf: "123", status: "all", branchName: "all", date: "" })).toBe(true);
    expect(hasHistoryFilters({ cpf: "", status: "open", branchName: "all", date: "" })).toBe(true);
  });

  it("normaliza respostas defensivamente", () => {
    expect(normalizeHistoryItems({ items: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(normalizeHistoryItems({ items: null })).toEqual([]);
    expect(normalizeBranches([{ id: 7, name: "Filial Nova" }, { id: 8 }])).toEqual([
      { id: 7, name: "Filial Nova" },
    ]);
  });

  it("formata data e hora preservando America/Sao_Paulo", () => {
    expect(formatHistoryDateParts("2026-07-22T12:30:00Z")).toEqual({
      date: "22/07/2026",
      time: "09:30",
    });
    expect(formatHistoryDate("2026-07-22T12:30:00Z")).toBe("22/07/2026 09:30");
  });

  it("padroniza erros sem expor mensagens técnicas da API", () => {
    expect(historyLoadErrorMessage({ request: {} })).toEqual({
      message: "Não foi possível conectar ao servidor.",
      complement: "Verifique sua conexão e tente novamente.",
    });
    expect(historyLoadErrorMessage({ response: { status: 403, data: { message: "branchId negado" } } })).toEqual({
      message: "Você não tem permissão para consultar este histórico.",
      complement: "",
    });
    expect(historyLoadErrorMessage({ response: { status: 500, data: { message: "stack trace" } } })).toEqual({
      message: "Não foi possível carregar o histórico.",
      complement: "Tente novamente em alguns instantes.",
    });
  });
});
