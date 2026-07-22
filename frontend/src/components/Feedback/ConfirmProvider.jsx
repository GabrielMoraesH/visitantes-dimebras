/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./ConfirmProvider.css";

const ConfirmContext = createContext(null);

const initialState = {
  open: false,
  title: "Confirmar ação",
  message: "",
  confirmText: "Confirmar",
  cancelText: "Cancelar",
  type: "default",
};

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(initialState);
  const resolverRef = useRef(null);
  const confirmButtonRef = useRef(null);

  const close = useCallback((result) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }

    setDialog((current) => ({ ...current, open: false }));
  }, []);

  const confirm = useCallback((options = {}) => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }

    setDialog({
      ...initialState,
      ...options,
      open: true,
      type: options.type || "default",
    });

    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!dialog.open) return;

    const focusTimer = window.setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        close(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        close(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, dialog.open]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      {dialog.open && (
        <div
          className="confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div
            className={`confirm-dialog confirm-dialog--${dialog.type}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
          >
            <div className="confirm-dialog__header">
              <div className="confirm-dialog__mark" aria-hidden="true" />
              <h2 id="confirm-dialog-title" className="confirm-dialog__title">
                {dialog.title}
              </h2>
            </div>

            <p id="confirm-dialog-message" className="confirm-dialog__message">
              {dialog.message}
            </p>

            <div className="confirm-dialog__actions">
              <button
                className="confirm-dialog__button confirm-dialog__button--cancel"
                type="button"
                onClick={() => close(false)}
              >
                {dialog.cancelText}
              </button>

              <button
                ref={confirmButtonRef}
                className="confirm-dialog__button confirm-dialog__button--confirm"
                type="button"
                onClick={() => close(true)}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error("useConfirm deve ser usado dentro de ConfirmProvider");
  }

  return context.confirm;
}
