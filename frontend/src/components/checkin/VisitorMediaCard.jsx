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
          <div className="photo-placeholder">FOTO OBRIGATÓRIA</div>
        )}
      </div>

      <div className="file-actions">
        <button
          className={`btn w-full ${photoExpired ? "btn-primary" : "btn-light"}`}
          onClick={() => onOpenCamera("photo")}
          disabled={updatingFiles}
          type="button"
        >
          {updatingFiles ? "ATUALIZANDO..." : photoExpired ? "ATUALIZAR FOTO" : "TROCAR FOTO"}
        </button>

        {docExpired && (
          <>
            <button
              className="btn btn-primary w-full"
              onClick={() => onOpenCamera("docFront")}
              disabled={updatingFiles}
              type="button"
            >
              {updatingFiles ? "ATUALIZANDO..." : "ATUALIZAR DOC (FRENTE)"}
            </button>

            <button
              className="btn btn-primary w-full"
              onClick={() => onOpenCamera("docBack")}
              disabled={updatingFiles}
              type="button"
            >
              {updatingFiles ? "ATUALIZANDO..." : "ATUALIZAR DOC (VERSO)"}
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
