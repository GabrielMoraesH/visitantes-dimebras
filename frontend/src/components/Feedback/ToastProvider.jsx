/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import "./ToastProvider.css";

const ToastContext = createContext(null);

const TOAST_DURATION = 3500;
const EXIT_DURATION = 220;

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children, position = "top-right" }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, exiting: true } : toast
      )
    );

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, EXIT_DURATION);
  }, []);

  const show = useCallback(
    (message, type = "info", options = {}) => {
      if (!message) return null;

      const id = createId();
      const duration = options.duration ?? TOAST_DURATION;

      setToasts((current) => [
        ...current,
        {
          id,
          type,
          message,
          exiting: false,
        },
      ]);

      if (duration !== false && duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show(message, "success", options),
      error: (message, options) => show(message, "error", options),
      warning: (message, options) => show(message, "warning", options),
      info: (message, options) => show(message, "info", options),
    }),
    [dismiss, show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className={`toast-viewport toast-viewport--${position}`}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.type} ${
              toast.exiting ? "toast--exiting" : ""
            }`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <span className="toast__icon" aria-hidden="true" />
            <div className="toast__message">{toast.message}</div>
            <button
              className="toast__close"
              type="button"
              aria-label="Fechar mensagem"
              onClick={() => dismiss(toast.id)}
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider");
  }

  return context;
}
