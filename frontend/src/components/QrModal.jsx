import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api } from "../services/api";
import "../styles/qrmodal.css";

function authHeader() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

export default function QrModal({ onClose, onToast }) {
  const qrRef = useRef(null);
  const startedRef = useRef(false);
  const handledRef = useRef(false);

  const [error, setError] = useState("");

  const [manualCode, setManualCode] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function stopScanner() {
      const qr = qrRef.current;
      if (!qr) return;

      try {
        if (startedRef.current) {
          await qr.stop();
          startedRef.current = false;
        }
      } catch {}

      try {
        await qr.clear();
      } catch {}

      qrRef.current = null;
    }

    async function startScanner() {
      setError("");
      handledRef.current = false;

      try {
        qrRef.current = new Html5Qrcode("reader");

        await qrRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 }, // mantém EXATAMENTE como você tinha
          async (decodedText) => {
            if (cancelled) return;
            if (handledRef.current) return;

            handledRef.current = true;

            await stopScanner();

            try {
              await api.post(
                "/visits/checkout",
                { visitCode: decodedText },
                { headers: authHeader() }
              );

              onToast?.("Checkout concluído!");
              onClose();
            } catch (e) {
              const msg = e?.response?.data?.message || "Erro ao registrar saída";
              onToast?.(msg, "error");
              onClose();
            }
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
  }, [onClose, onToast]);

  async function handleManualCheckout() {
    const code = String(manualCode || "").trim();
    if (!code) {
      onToast?.("Digite o código do QR.", "error");
      return;
    }

    try {
      setManualLoading(true);

      await api.post(
        "/visits/checkout",
        { visitCode: code },
        { headers: authHeader() }
      );

      onToast?.("Checkout concluído!");
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.message || "Erro ao registrar saída";
      onToast?.(msg, "error");
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <div className="qr-overlay">
      <div className="qr-modal">
        <h3 className="qr-title">Escaneie o QR</h3>

        {error ? (
          <div className="qr-error">
            <p>{error}</p>
          </div>
        ) : (
          <div id="reader" className="qr-reader" />
        )}

        <div className="qr-divider">
          <span>OU DIGITE O CÓDIGO DO QR</span>
        </div>

        <form
          className="qr-manual"
          onSubmit={(e) => {
            e.preventDefault();
            handleManualCheckout();
          }}
        >
          <input
            className="qr-input"
            placeholder="Ex: A1B2C3D4E5F6"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            autoFocus={false}
          />

          <button className="qr-btn qr-btn-primary" type="submit" disabled={manualLoading}>
            {manualLoading ? "SAINDO..." : "DAR SAÍDA"}
          </button>
        </form>

        <div className="qr-actions">
          <button className="qr-btn qr-btn-ghost" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}