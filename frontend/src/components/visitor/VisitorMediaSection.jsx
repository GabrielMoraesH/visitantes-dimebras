function MediaPreview({ alt, file, placeholder, previewUrl, variant = "" }) {
  return (
    <div className={`cadastro-photoBox${variant ? ` ${variant}` : ""}`}>
      {file ? (
        <img src={previewUrl} alt={alt} className="cadastro-photo" />
      ) : (
        <div className="cadastro-photoPlaceholder">{placeholder}</div>
      )}
    </div>
  );
}

function CaptureButton({ children, onClick, saving }) {
  return (
    <button className="btn btn-primary w-full" onClick={onClick} disabled={saving} type="button">
      {children}
    </button>
  );
}

export default function VisitorMediaSection({
  docBack,
  docBackPreview,
  docFront,
  docFrontPreview,
  onOpenCamera,
  photo,
  photoPreview,
  saving,
}) {
  return (
    <div className="cadastro-media">
      <MediaPreview
        alt="Foto do visitante"
        file={photo}
        placeholder="FOTO DO VISITANTE"
        previewUrl={photoPreview}
      />

      <CaptureButton onClick={() => onOpenCamera("photo")} saving={saving}>
        {photo ? "TROCAR FOTO DO VISITANTE" : "TIRAR FOTO DO VISITANTE"}
      </CaptureButton>

      <MediaPreview
        alt="Documento frente"
        file={docFront}
        placeholder="DOCUMENTO (FRENTE)"
        previewUrl={docFrontPreview}
        variant="cadastro-photoBox--document"
      />

      <CaptureButton onClick={() => onOpenCamera("docFront")} saving={saving}>
        {docFront ? "TROCAR DOCUMENTO (FRENTE)" : "FOTOGRAFAR DOCUMENTO (FRENTE)"}
      </CaptureButton>

      <MediaPreview
        alt="Documento verso"
        file={docBack}
        placeholder="DOCUMENTO (VERSO)"
        previewUrl={docBackPreview}
        variant="cadastro-photoBox--document"
      />

      <CaptureButton onClick={() => onOpenCamera("docBack")} saving={saving}>
        {docBack ? "TROCAR DOCUMENTO (VERSO)" : "FOTOGRAFAR DOCUMENTO (VERSO)"}
      </CaptureButton>

      <div className="cadastro-note">
        * Para melhor leitura do documento, mantenha boa iluminação e aproxime o papel da câmera.
      </div>
    </div>
  );
}
