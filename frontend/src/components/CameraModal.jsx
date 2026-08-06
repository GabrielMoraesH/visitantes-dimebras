import { useCallback, useEffect, useId, useRef, useState } from "react";
import "../styles/cameraModal.css";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isVisible(element) {
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function getFocusableElements(container) {
  if (!container) return [];

  return Array.from(container.querySelectorAll(focusableSelector)).filter(
    (element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden") && isVisible(element)
  );
}

function getTitle(captureTarget, mode) {
  if (captureTarget === "docFront") return "Fotografar documento - frente";
  if (captureTarget === "docBack") return "Fotografar documento - verso";
  if (mode === "document") return "Fotografar documento";
  return "Fotografar visitante";
}

export default function CameraModal({
  captureTarget = null,
  captureErrorMessage = "Erro ao capturar a imagem.",
  onClose,
  onCapture,
  mode = "photo",
  returnFocusRef = null,
}) {
  const titleId = useId();
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const title = getTitle(captureTarget, mode);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    stop();
    onClose();
  }, [onClose, stop]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setError("");
      setReady(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
      }
    }

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef?.current;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const initialTarget = closeButtonRef.current || getFocusableElements(modalRef.current)[0];
      initialTarget?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      returnFocusElement?.focus?.();
    };
  }, [returnFocusRef]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !ready) return;

    const w = video.videoWidth;
    const h = video.videoHeight;

    if (!w || !h) {
      setError("A câmera ainda está carregando.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    const quality = mode === "document" ? 0.95 : 0.9;

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );

    if (!blob) {
      setError(captureErrorMessage);
      return;
    }

    stop();
    onCapture(blob);
  }, [captureErrorMessage, mode, onCapture, ready, stop]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Tab") {
        const focusableElements = getFocusableElements(modalRef.current);

        if (focusableElements.length === 0) {
          event.preventDefault();
          modalRef.current?.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey && activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
          return;
        }

        if (!event.shiftKey && activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
          return;
        }

        if (!modalRef.current?.contains(activeElement)) {
          event.preventDefault();
          firstElement.focus();
        }

        return;
      }

      if (event.key !== "Enter" || !ready || error) return;
      if (event.target?.closest?.("button, input, select, textarea, a[href]")) return;

      event.preventDefault();
      capture();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [capture, close, error, ready]);

  return (
    <div className="cam-overlay">
      <div
        ref={modalRef}
        className="cam-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="cam-title" id={titleId}>
          {title}
        </div>

        {error ? (
          <div className="cam-error">{error}</div>
        ) : (
          <div className="cam-videoWrap">
            <video
              ref={videoRef}
              className="cam-video"
              playsInline
              muted
              onLoadedMetadata={() => setReady(true)}
            />

            {mode === "document" && <div className="doc-guide" />}
          </div>
        )}

        <div className="cam-actions">
          <button
            ref={closeButtonRef}
            className="cam-actionButton cam-actionButton--secondary"
            type="button"
            onClick={close}
            aria-label="Fechar câmera"
          >
            Cancelar
          </button>

          <button
            className="cam-actionButton cam-actionButton--primary"
            type="button"
            onClick={capture}
            disabled={!ready || !!error}
          >
            Capturar
          </button>
        </div>
      </div>
    </div>
  );
}
