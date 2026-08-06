import { useState } from "react";
import { PencilIcon, SpinnerIcon, ToggleIcon, TrashIcon } from "./TvContentIcons";

export default function TvContentActions({ item, onEdit, onRemove, onToggle }) {
  const [pendingActions, setPendingActions] = useState({});
  const toggleText = item.isActive ? "Desativar conteúdo" : "Ativar conteúdo";
  const toggleLoadingText = item.isActive ? "Desativando..." : "Ativando...";
  const isToggling = Boolean(pendingActions.toggle);
  const isRemoving = Boolean(pendingActions.remove);

  async function runAction(action, handler) {
    if (pendingActions[action]) return;

    try {
      setPendingActions((prev) => ({ ...prev, [action]: true }));
      await handler(item);
    } finally {
      setPendingActions((prev) => ({ ...prev, [action]: false }));
    }
  }

  return (
    <div className="tc-actions">
      <button
        className="tc-iconBtn tc-iconBtn-edit"
        onClick={() => onEdit(item)}
        title="Editar conteúdo"
        aria-label={`Editar conteúdo ${item.title}`}
        type="button"
      >
        <PencilIcon />
      </button>
      <button
        className="tc-iconBtn tc-iconBtn-toggle tc-iconBtn-warning"
        disabled={isToggling}
        onClick={() => runAction("toggle", onToggle)}
        title={isToggling ? toggleLoadingText : toggleText}
        aria-label={isToggling ? `${toggleLoadingText} ${item.title}` : `${toggleText} ${item.title}`}
        aria-busy={isToggling ? "true" : undefined}
        type="button"
      >
        {isToggling ? (
          <>
            <SpinnerIcon />
            <span className="tc-srOnly">
              {item.isActive
                ? "Desativando conteúdo, aguarde..."
                : "Ativando conteúdo, aguarde..."}
            </span>
          </>
        ) : (
          <ToggleIcon />
        )}
      </button>
      <button
        className="tc-iconBtn tc-iconBtn-del"
        disabled={isRemoving}
        onClick={() => runAction("remove", onRemove)}
        title={isRemoving ? "Excluindo..." : "Excluir conteúdo"}
        aria-label={isRemoving ? `Excluindo... ${item.title}` : `Excluir conteúdo ${item.title}`}
        aria-busy={isRemoving ? "true" : undefined}
        type="button"
      >
        {isRemoving ? (
          <>
            <SpinnerIcon />
            <span className="tc-srOnly">Excluindo conteúdo, aguarde...</span>
          </>
        ) : (
          <TrashIcon />
        )}
      </button>
    </div>
  );
}
