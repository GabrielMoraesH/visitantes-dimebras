export default function VisitorMediaCard({
  docBackUrl,
  docFrontUrl,
  docExpired,
  noPendingUpdates,
  onOpenCamera,
  photoExpired,
  photoSrc,
  updatingFiles,
}) {
  return (
    <div className={`card ${noPendingUpdates ? "card-photoLarge" : ""}`}>
      <div className="photo-box">
        {photoSrc ? (
          <img className="photo-preview" src={photoSrc} alt="Foto" />
        ) : (
          <div className="photo-placeholder">Fotografe o visitante.</div>
        )}
      </div>

      <div className="file-actions">
        <button
          className={`btn w-full ${photoExpired ? "btn-primary" : "btn-light"}`}
          onClick={() => onOpenCamera("photo")}
          disabled={updatingFiles}
          type="button"
        >
          <span aria-live="polite">{updatingFiles ? "Atualizando..." : photoExpired ? "ATUALIZAR FOTO" : "TROCAR FOTO"}</span>
        </button>

        {docExpired && (
          <>
            <button
              className="btn btn-primary w-full"
              onClick={() => onOpenCamera("docFront")}
              disabled={updatingFiles}
              type="button"
            >
              <span aria-live="polite">{updatingFiles ? "Atualizando..." : "ATUALIZAR DOC (FRENTE)"}</span>
            </button>

            <button
              className="btn btn-primary w-full"
              onClick={() => onOpenCamera("docBack")}
              disabled={updatingFiles}
              type="button"
            >
              <span aria-live="polite">{updatingFiles ? "Atualizando..." : "ATUALIZAR DOC (VERSO)"}</span>
            </button>
          </>
        )}

        {noPendingUpdates && (docFrontUrl || docBackUrl) && (
          <div className="doc-previews">
            {docFrontUrl && (
              <div className="doc-mini">
                <div className="doc-miniTitle">DOC (FRENTE)</div>
                <img src={docFrontUrl} alt="Documento frente" />
              </div>
            )}
            {docBackUrl && (
              <div className="doc-mini">
                <div className="doc-miniTitle">DOC (VERSO)</div>
                <img src={docBackUrl} alt="Documento verso" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
