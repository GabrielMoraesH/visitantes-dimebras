import { branchIdsFromItem, sameBranchSet } from "../../utils/tvContent";

export default function TvBranchList({ branches, allBranches }) {
  if (sameBranchSet(branchIdsFromItem({ branches }), allBranches)) {
    return <span className="tc-branch-badge tc-branch-badge-all">Todas as filiais</span>;
  }

  if (!Array.isArray(branches) || branches.length === 0) {
    return <span className="tc-branch-list">-</span>;
  }

  return (
    <div className="tc-branch-list">
      {branches.map((branch) => (
        <span className="tc-branch-badge" key={branch.id}>
          {branch.name}
        </span>
      ))}
    </div>
  );
}
