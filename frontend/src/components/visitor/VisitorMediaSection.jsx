function MediaCompleteStatus({ children }) {
  return (
    <span className="cadastro-mediaStatus">
      <span className="cadastro-mediaStatusIcon" aria-hidden="true">
        ✓
      </span>
      {children}
    </span>
  );
}

function MediaPreview({ alt, file, placeholder, previewUrl, statusText, variant = "" }) {
  return (
    <div className="cadastro-mediaItem" data-media-item={placeholder}>
      <div className={`cadastro-photoBox${variant ? ` ${variant}` : ""}`}>
        {file ? (
          <img src={previewUrl} alt={alt} className="cadastro-photo" />
        ) : (
          <div className="cadastro-photoPlaceholder">{placeholder}</div>
        )}
      </div>
      {file && (
        <MediaCompleteStatus>
          {statusText}
        </MediaCompleteStatus>
      )}
    </div>
  );
}

function CaptureButton({ buttonRef, children, describedBy, onClick, saving }) {
  return (
    <button
      ref={buttonRef}
      className="btn btn-capture w-full"
      onClick={onClick}
      disabled={saving}
      type="button"
      aria-describedby={describedBy || undefined}
      aria-invalid={describedBy ? "true" : "false"}
    >
      {children}
    </button>
  );
}

function MediaCaptureBlock({
  buttonRef,
  buttonText,
  error,
  errorId,
  onClick,
  previewProps,
  saving,
}) {
  return (
    <div className="cadastro-mediaGroup" aria-describedby={error ? errorId : undefined}>
      <MediaPreview {...previewProps} />
      <CaptureButton buttonRef={buttonRef} describedBy={error ? errorId : ""} onClick={onClick} saving={saving}>
        {buttonText}
      </CaptureButton>
      {error && (
        <div className="cadastro-fieldError" id={errorId}>
          {error}
        </div>
      )}
    </div>
  );
}

export default function VisitorMediaSection({
  docBack,
  docBackError = "",
  docBackPreview,
  docFront,
  docFrontError = "",
  docFrontPreview,
  captureButtonRefs = {},
  onOpenCamera,
  photo,
  photoError = "",
  photoPreview,
  saving,
}) {
  return (
    <div className="cadastro-media">
      <MediaCaptureBlock
        buttonRef={captureButtonRefs.photo}
        buttonText={photo ? "TROCAR FOTO DO VISITANTE" : "TIRAR FOTO DO VISITANTE"}
        error={photoError}
        errorId="cadastro-photo-error"
        onClick={() => onOpenCamera("photo")}
        previewProps={{
          alt: "Foto do visitante",
          file: photo,
          placeholder: "FOTO DO VISITANTE",
          previewUrl: photoPreview,
          statusText: "Foto capturada",
        }}
        saving={saving}
      />

      <MediaCaptureBlock
        buttonRef={captureButtonRefs.docFront}
        buttonText={docFront ? "TROCAR DOCUMENTO (FRENTE)" : "FOTOGRAFAR DOCUMENTO (FRENTE)"}
        error={docFrontError}
        errorId="cadastro-doc-front-error"
        onClick={() => onOpenCamera("docFront")}
        previewProps={{
          alt: "Documento frente",
          file: docFront,
          placeholder: "DOCUMENTO (FRENTE)",
          previewUrl: docFrontPreview,
          statusText: "Frente capturada",
          variant: "cadastro-photoBox--document",
        }}
        saving={saving}
      />

      <MediaCaptureBlock
        buttonRef={captureButtonRefs.docBack}
        buttonText={docBack ? "TROCAR DOCUMENTO (VERSO)" : "FOTOGRAFAR DOCUMENTO (VERSO)"}
        error={docBackError}
        errorId="cadastro-doc-back-error"
        onClick={() => onOpenCamera("docBack")}
        previewProps={{
          alt: "Documento verso",
          file: docBack,
          placeholder: "DOCUMENTO (VERSO)",
          previewUrl: docBackPreview,
          statusText: "Verso capturado",
          variant: "cadastro-photoBox--document",
        }}
        saving={saving}
      />

      <div className="cadastro-note">
        * Para melhor leitura do documento, mantenha boa iluminação e aproxime o papel da câmera.
      </div>
    </div>
  );
}
