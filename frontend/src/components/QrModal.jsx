import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import api from "../services/api";
import { getToken } from "../services/session";
import "../styles/qrmodal.css";

function authHeader() {
  const token = getToken();
  return { Authorization: `Bearer ${token}` };
}

export default function QrModal({ onClose, onToast, onCheckoutDone }) {
  const qrRef = useRef(null);
  const startedRef = useRef(false);
  const handledRef = useRef(false);

  const [error, setError] = useState("");

  const [manualCode, setManualCode] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  async function stopScanner() {
    const qr = qrRef.current;
    if (!qr) return;

    try {
      if (startedRef.current) {
        await qr.stop();
        startedRef.current = false;
      }
    } catch {
      // Scanner may already be stopped by the library during teardown.
    }

    try {
      await qr.clear();
    } catch {
      // Clear can fail if the reader node was already released.
    }

    qrRef.current = null;
  }

  async function doCheckout(visitCode) {
    const code = String(visitCode || "").trim();
    if (!code) {
      onToast?.("Código inválido.", "error");
      return;
    }

    if (handledRef.current) return;
    handledRef.current = true;

    try {
      await api.post("/visits/checkout", { visitCode: code }, { headers: authHeader() });

      onToast?.("Checkout concluído!");
      onCheckoutDone?.();
      onClose?.();
    } catch (e) {
      handledRef.current = false;
      const msg = e?.response?.data?.message || "Erro ao registrar saída";
      onToast?.(msg, "error");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      setError("");
      handledRef.current = false;

      try {
        qrRef.current = new Html5Qrcode("reader");

        await qrRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          async (decodedText) => {
            if (cancelled) return;
            await stopScanner(); // para evitar ler 2x
            await doCheckout(decodedText);
          },
          () => {}
        );

        startedRef.current = true;
      } catch (e) {
        setError(
          e?.message ||
            "Não foi possível acessar a câmera. Verifique permissões e se outra aplicação está usando."
        );
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualCheckout() {
    if (manualLoading) return;
    setManualLoading(true);
    try {
      await doCheckout(manualCode);
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <div className="qr-overlay">
      <div className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title">
        <div className="qr-modal-header">
          <div>
            <h2 className="qr-title" id="qr-modal-title">
              Saída por QR Code
            </h2>
            <p className="qr-subtitle">Aponte o QR Code da etiqueta para a câmera</p>
          </div>

          <button
            className="qr-modal-close"
            onClick={() => {
              onClose?.();
            }}
            type="button"
            aria-label="Fechar modal"
          >
            ×
          </button>
        </div>

        {error ? (
          <div className="qr-error">
            <p>{error}</p>
          </div>
        ) : (
          <div className="qr-camera-container">
            <div id="reader" className="qr-reader" />
          </div>
        )}

        <div className="qr-divider">
          <span>ou digite o código manualmente</span>
        </div>

        <div className="qr-manual-section">
          <label className="qr-manual-label" htmlFor="qr-manual-code">
            Código da visita
          </label>

          <form
            className="qr-manual"
            onSubmit={(e) => {
              e.preventDefault();
              handleManualCheckout();
            }}
          >
            <input
              id="qr-manual-code"
              className="qr-input"
              placeholder="Ex: A1B2C3D4E5F6"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              autoFocus={false}
              disabled={manualLoading}
            />

            <button className="qr-btn qr-btn-primary" type="submit" disabled={manualLoading}>
              {manualLoading ? "SAINDO..." : "DAR SAÍDA"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
