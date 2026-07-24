import { sameBranchSet } from "../../utils/tvContent";

export default function TvBranchSelector({ branches, selectedIds, onChange }) {
  const allSelected = sameBranchSet(selectedIds, branches);

  function toggleAll(checked) {
    onChange(checked ? branches.map((branch) => branch.id) : []);
  }

  function toggleBranch(branchId, checked) {
    if (checked) {
      onChange([...new Set([...selectedIds, branchId])]);
      return;
    }

    onChange(selectedIds.filter((id) => id !== branchId));
  }

  return (
    <div className="tc-branches">
      <label className="tc-label">Exibir em</label>
      <label className="tc-check tc-all-branches">
        <input
          type="checkbox"
          checked={allSelected}
          disabled={branches.length === 0}
          onChange={(e) => toggleAll(e.target.checked)}
        />
        <span>Todas as filiais</span>
      </label>

      <div className="tc-branches-grid">
        {branches.map((branch) => (
          <label className="tc-branch-option" key={branch.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(branch.id)}
              onChange={(e) => toggleBranch(branch.id, e.target.checked)}
            />
            <span>{branch.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
