import { useEffect } from "react";

export default function ConfirmModal({
  open,
  title = "Confirmar",
  message,
  confirmText = "Excluir",
  cancelText = "Cancelar",
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;

    function handleDocumentKeyDown(event) {
      if (event.key !== "Enter" || loading) return;

      event.preventDefault();
      onConfirm();
    }

    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [loading, onConfirm, open]);

  if (!open) return null;

  return (
    <div className="cmodal-backdrop" onMouseDown={onCancel}>
      <div
        className="cmodal"
        onMouseDown={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="cmodal-header">
          <div className="cmodal-title">{title}</div>
          <button className="cmodal-x" type="button" onClick={onCancel} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="cmodal-body">
          <p className="cmodal-message">{message}</p>
        </div>

        <div className="cmodal-actions">
          <button className="au-btn au-btn-ghost" type="button" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>

          <button
            className={`au-btn ${danger ? "au-btn-danger" : "au-btn-primary"}`}
            type="button"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "EXCLUINDO..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
