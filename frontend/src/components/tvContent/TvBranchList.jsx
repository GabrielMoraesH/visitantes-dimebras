import { branchIdsFromItem, sameBranchSet } from "../../utils/tvContent";

export default function TvBranchList({ branches, allBranches }) {
  const branchNames = Array.isArray(branches)
    ? branches.map((branch) => branch.name).filter(Boolean)
    : [];

  if (sameBranchSet(branchIdsFromItem({ branches }), allBranches)) {
    return (
      <span className="tc-branch-badge tc-branch-badge-all" title="Todas as filiais">
        Todas as filiais
      </span>
    );
  }

  if (!Array.isArray(branches) || branches.length === 0) {
    return (
      <span className="tc-branch-badge" title="Nenhuma filial">
        Nenhuma filial
      </span>
    );
  }

  const label = branches.length === 1 ? branchNames[0] || "Filial sem nome" : `${branches.length} filiais`;
  const tooltip = branchNames.length > 0 ? branchNames.join(", ") : label;

  return (
    <span className="tc-branch-badge" title={tooltip}>
      {label}
    </span>
  );
}
