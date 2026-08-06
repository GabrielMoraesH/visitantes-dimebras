import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import api from "../services/api";
import "../styles/qrmodal.css";

const CHECKOUT_MESSAGES = {
  codeRequired: "Informe ou leia o código da etiqueta.",
  codeInvalid: "Digite um código de etiqueta válido.",
  qrUnreadable: "Não foi possível ler o QR Code.",
  qrUnreadableDetail: "Aproxime novamente a câmera da etiqueta.",
  cameraUnavailable: "Não foi possível acessar a câmera.",
  cameraUnavailableDetail: "Verifique as permissões e tente novamente.",
  cameraUnsupported: "Este dispositivo não suporta leitura pela câmera.",
  visitNotFound: "Nenhuma visita foi encontrada para o código informado.",
  visitClosed: "Esta visita já foi finalizada.",
  network: "Não foi possível conectar ao servidor.",
  networkDetail: "Verifique sua conexão e tente novamente.",
  unexpected: "Não foi possível concluir o check-out.",
  unexpectedDetail: "Tente novamente em alguns instantes.",
  success: "Check-out realizado com sucesso.",
  loadingButton: "Realizando check-out...",
  loadingAccessible: "Realizando check-out, aguarde...",
};

function isValidLabelCode(value) {
  const code = String(value || "").trim();
  return code.length >= 6 && code.length <= 32;
}

function checkoutErrorMessage(error) {
  if (!error?.response) {
    return { title: CHECKOUT_MESSAGES.network, detail: CHECKOUT_MESSAGES.networkDetail };
  }

  const status = Number(error.response.status);
  const apiCode = String(error.response.data?.code || error.response.data?.error || "").toUpperCase();
  const apiMessage = String(error.response.data?.message || "").toLowerCase();

  if (
    apiCode.includes("CLOSED") ||
    apiCode.includes("FINISHED") ||
    apiMessage.includes("encerr") ||
    apiMessage.includes("finaliz") ||
    apiMessage.includes("checkout realizado")
  ) {
    return { title: CHECKOUT_MESSAGES.visitClosed };
  }

  if (status === 404) {
    return { title: CHECKOUT_MESSAGES.visitNotFound };
  }

  if (status === 400 || apiMessage.includes("qr inválido") || apiMessage.includes("qr invalido")) {
    return { title: CHECKOUT_MESSAGES.codeInvalid };
  }

  return { title: CHECKOUT_MESSAGES.unexpected, detail: CHECKOUT_MESSAGES.unexpectedDetail };
}

function cameraErrorMessage() {
  return { title: CHECKOUT_MESSAGES.cameraUnavailable, detail: CHECKOUT_MESSAGES.cameraUnavailableDetail };
}

function Message({ className = "qr-error", id, message, role = "alert" }) {
  if (!message?.title) return null;

  return (
    <div className={className} id={id} role={role} tabIndex={role === "alert" ? -1 : undefined}>
      <p>{message.title}</p>
      {message.detail ? <p>{message.detail}</p> : null}
    </div>
  );
}

export default function QrModal({ onClose, onToast, onCheckoutDone }) {
  const qrRef = useRef(null);
  const startedRef = useRef(false);
  const handledRef = useRef(false);
  const manualInputRef = useRef(null);

  const [cameraMessage, setCameraMessage] = useState(null);
  const [qrMessage, setQrMessage] = useState(null);
  const [manualMessage, setManualMessage] = useState(null);

  const [manualCode, setManualCode] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  const manualErrorId = "qr-manual-code-error";
  const loadingId = "qr-checkout-loading";

  async function stopScanner() {
    const qr = qrRef.current;
    if (!qr) return;

    try {
      if (startedRef.current) {
        await qr.stop();
        startedRef.current = false;
      }
    } catch {
      // O scanner pode já ter sido interrompido pela biblioteca durante o encerramento.
    }

    try {
      await qr.clear();
    } catch {
      // A operação de limpeza (*clear*) pode falhar se o nó de leitura já tiver sido liberado.
    }

    qrRef.current = null;
  }

  async function doCheckout(visitCode) {
    const code = String(visitCode || "").trim();
    if (!code) {
      setManualMessage({ title: CHECKOUT_MESSAGES.codeRequired });
      setTimeout(() => manualInputRef.current?.focus(), 0);
      return false;
    }

    if (!isValidLabelCode(code)) {
      setManualMessage({ title: CHECKOUT_MESSAGES.codeInvalid });
      setTimeout(() => manualInputRef.current?.focus(), 0);
      return false;
    }

    if (handledRef.current) return false;
    handledRef.current = true;
    setManualMessage(null);

    try {
      await api.post("/visits/checkout", { visitCode: code });

      onToast?.(CHECKOUT_MESSAGES.success, "success");
      onCheckoutDone?.();
      onClose?.();
      return true;
    } catch (e) {
      handledRef.current = false;
      setManualMessage(checkoutErrorMessage(e));
      setTimeout(() => manualInputRef.current?.focus(), 0);
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      setCameraMessage(null);
      setQrMessage(null);
      handledRef.current = false;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraMessage({ title: CHECKOUT_MESSAGES.cameraUnsupported });
          return;
        }

        qrRef.current = new Html5Qrcode("reader");

        await qrRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          async (decodedText) => {
            if (cancelled) return;
            if (!isValidLabelCode(decodedText)) {
              setQrMessage({
                title: CHECKOUT_MESSAGES.codeInvalid,
              });
              return;
            }
            await stopScanner(); // para evitar ler 2x
            await doCheckout(decodedText);
          },
          () => {}
        );

        startedRef.current = true;
      } catch {
        setCameraMessage(cameraErrorMessage());
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

        {cameraMessage ? (
          <Message message={cameraMessage} />
        ) : (
          <div className="qr-camera-container" aria-describedby={qrMessage ? "qr-read-error" : undefined}>
            <div id="reader" className="qr-reader" />
          </div>
        )}
        <Message id="qr-read-error" message={qrMessage} />

        <div className="qr-divider">
          <span>ou digite o código manualmente</span>
        </div>

        <div className="qr-manual-section">
          <label className="qr-manual-label" htmlFor="qr-manual-code">
            Código da etiqueta
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
              placeholder="Ex: 12345678"
              value={manualCode}
              onChange={(e) => {
                setManualCode(e.target.value);
                setManualMessage(null);
              }}
              autoFocus={false}
              disabled={manualLoading}
              ref={manualInputRef}
              aria-invalid={manualMessage ? "true" : "false"}
              aria-describedby={
                [manualMessage ? manualErrorId : "", manualLoading ? loadingId : ""].filter(Boolean).join(" ") ||
                undefined
              }
            />

            <button className="qr-btn qr-btn-primary" type="submit" disabled={manualLoading}>
              {manualLoading ? CHECKOUT_MESSAGES.loadingButton : "Dar saída"}
            </button>
          </form>
          <Message id={manualErrorId} className="qr-field-error" message={manualMessage} />
          <span className="qr-sr-only" id={loadingId} aria-live="polite">
            {manualLoading ? CHECKOUT_MESSAGES.loadingAccessible : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
