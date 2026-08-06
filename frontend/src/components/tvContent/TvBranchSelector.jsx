import { sameBranchSet } from "../../utils/tvContent";

export default function TvBranchSelector({
  branches,
  error = "",
  idPrefix = "tv-content",
  selectedIds,
  onChange,
}) {
  const allSelected = sameBranchSet(selectedIds, branches);
  const describedBy = error ? `${idPrefix}-branches-error` : undefined;

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
    <div className="tc-branches" role="group" aria-labelledby={`${idPrefix}-branches-label`}>
      <span className="tc-label" id={`${idPrefix}-branches-label`}>
        Exibir em
      </span>
      <label className="tc-check tc-all-branches">
        <input
          type="checkbox"
          checked={allSelected}
          disabled={branches.length === 0}
          onChange={(e) => toggleAll(e.target.checked)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
        />
        <span>Todas as filiais</span>
      </label>

      <div className="tc-branches-grid">
        {branches.map((branch) => (
          <label className="tc-branch-option" key={branch.id} title={branch.name}>
            <input
              type="checkbox"
              checked={selectedIds.includes(branch.id)}
              onChange={(e) => toggleBranch(branch.id, e.target.checked)}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={describedBy}
            />
            <span>{branch.name}</span>
          </label>
        ))}
      </div>

      {error ? (
        <div className="tc-fieldError" id={describedBy}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
