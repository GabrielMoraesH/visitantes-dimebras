import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/cameraModal.css";

export default function CameraModal({ onClose, onCapture, mode = "photo" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

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
      setError("Erro ao capturar a imagem.");
      return;
    }

    stop();
    onCapture(blob);
  }, [mode, onCapture, ready, stop]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== "Enter" || !ready || error) return;

      event.preventDefault();
      capture();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [capture, error, ready]);

  return (
    <div className="cam-overlay">
      <div className="cam-modal">
        <div className="cam-title">
          {mode === "document" ? "Fotografar documento" : "Tirar foto"}
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
            className="btn btn-light"
            type="button"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            Cancelar
          </button>

          <button className="btn btn-primary" type="button" onClick={capture} disabled={!ready || !!error}>
            Capturar
          </button>
        </div>
      </div>
    </div>
  );
}
