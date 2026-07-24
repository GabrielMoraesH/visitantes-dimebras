import { PencilIcon, ToggleIcon, TrashIcon } from "./TvContentIcons";

export default function TvContentActions({ item, onEdit, onRemove, onToggle }) {
  return (
    <div className="tc-actions">
      <button
        className="tc-iconBtn tc-iconBtn-edit"
        onClick={() => onEdit(item)}
        title="Editar"
        type="button"
      >
        <PencilIcon />
      </button>
      <button
        className="tc-iconBtn tc-iconBtn-toggle"
        onClick={() => onToggle(item)}
        title={item.isActive ? "Desativar" : "Ativar"}
        type="button"
      >
        <ToggleIcon />
      </button>
      <button
        className="tc-iconBtn tc-iconBtn-del"
        onClick={() => onRemove(item)}
        title="Excluir"
        type="button"
      >
        <TrashIcon />
      </button>
    </div>
  );
}
