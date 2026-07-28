import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TvBranchList from "./TvBranchList";

const allBranches = [
  { id: 1, name: "Alfama" },
  { id: 2, name: "Matriz" },
  { id: 3, name: "Unidade 2" },
  { id: 5, name: "Unidade 3" },
];

describe("TvBranchList", () => {
  it("exibe um unico badge para todas as filiais", () => {
    render(<TvBranchList branches={allBranches} allBranches={allBranches} />);

    const badge = screen.getByText("Todas as filiais");
    expect(badge).toHaveClass("tc-branch-badge", "tc-branch-badge-all");
    expect(badge).toHaveAttribute("title", "Todas as filiais");
    expect(screen.getAllByText("Todas as filiais")).toHaveLength(1);
  });

  it("exibe o nome quando ha uma filial", () => {
    render(<TvBranchList branches={[allBranches[0]]} allBranches={allBranches} />);

    const badge = screen.getByText("Alfama");
    expect(badge).toHaveClass("tc-branch-badge");
    expect(badge).toHaveAttribute("title", "Alfama");
  });

  it("exibe a quantidade quando ha duas filiais", () => {
    render(<TvBranchList branches={allBranches.slice(0, 2)} allBranches={allBranches} />);

    const badge = screen.getByText("2 filiais");
    expect(badge).toHaveClass("tc-branch-badge");
    expect(badge).toHaveAttribute("title", "Alfama, Matriz");
    expect(screen.queryByText("Alfama")).not.toBeInTheDocument();
    expect(screen.queryByText("Matriz")).not.toBeInTheDocument();
  });

  it("exibe a quantidade quando ha quatro filiais especificas", () => {
    render(
      <TvBranchList
        branches={[allBranches[0], allBranches[1], allBranches[2], { id: 6, name: "Unidade 4" }]}
        allBranches={allBranches}
      />
    );

    const badge = screen.getByText("4 filiais");
    expect(badge).toHaveClass("tc-branch-badge");
    expect(badge).toHaveAttribute("title", "Alfama, Matriz, Unidade 2, Unidade 4");
  });

  it("exibe nenhuma filial para uma lista vazia inesperada", () => {
    render(<TvBranchList branches={[]} allBranches={allBranches} />);

    const badge = screen.getByText("Nenhuma filial");
    expect(badge).toHaveClass("tc-branch-badge");
    expect(badge).toHaveAttribute("title", "Nenhuma filial");
  });
});
