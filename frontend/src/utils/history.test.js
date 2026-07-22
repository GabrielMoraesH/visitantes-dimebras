import { describe, expect, it } from "vitest";
import {
  buildHistoryParams,
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

  it("normaliza respostas defensivamente", () => {
    expect(normalizeHistoryItems({ items: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(normalizeHistoryItems({ items: null })).toEqual([]);
    expect(normalizeBranches([{ id: 7, name: "Filial Nova" }, { id: 8 }])).toEqual([
      { id: 7, name: "Filial Nova" },
    ]);
  });
});
