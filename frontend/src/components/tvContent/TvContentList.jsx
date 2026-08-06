import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatBytes,
  formatTvContentDateTime,
  formatTvContentTitle,
  mediaUrl,
  TV_CONTENT_MESSAGES,
  tvContentTypeLabel,
} from "../../utils/tvContent";
import TvBranchList from "./TvBranchList";
import TvContentActions from "./TvContentActions";
import { PlayIcon } from "./TvContentIcons";

function formatVideoDuration(value) {
  if (!Number.isFinite(value) || value <= 0) return "";

  const totalSeconds = Math.floor(value);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function TvContentPreview({ item, onOpenVideo }) {
  const [duration, setDuration] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const src = mediaUrl(item.fileUrl);
  const previewLabel = item.title || "Prévia do conteúdo";

  if (previewError) {
    return (
      <span className="tc-previewFallback" role="img" aria-label="Prévia indisponível">
        Não foi possível carregar a prévia desta mídia.
      </span>
    );
  }

  if (item.type === "IMAGE") {
    return <img src={src} alt={previewLabel} onError={() => setPreviewError(true)} />;
  }

  function handleLoadedMetadata(event) {
    setDuration(formatVideoDuration(event.currentTarget.duration));
  }

  function handleDurationError() {
    setDuration("");
    setPreviewError(true);
  }

  return (
    <button
      type="button"
      className="tc-videoPreviewButton"
      aria-label={`Reproduzir prévia de ${previewLabel}`}
      onClick={(event) => onOpenVideo(item, event.currentTarget)}
    >
      <video
        src={src}
        muted
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleDurationError}
      />
      <span className="tc-videoPlay" aria-hidden="true">
        <PlayIcon />
      </span>
      {duration ? <span className="tc-videoDuration">{duration}</span> : null}
    </button>
  );
}

function TvContentDateCell({ value }) {
  const createdAt = formatTvContentDateTime(value);

  return (
    <div className="tc-dateTimeCell" title={createdAt.full}>
      <span className="tc-dateTimeDate">{createdAt.date}</span>
      {createdAt.time ? <span className="tc-dateTimeTime">{createdAt.time}</span> : null}
    </div>
  );
}

function TvContentTitleCell({ title }) {
  const fullTitle = title ?? "";
  const visibleTitle = formatTvContentTitle(title);

  return (
    <td className="tc-titleCell">
      <span className="tc-titleText" title={fullTitle}>
        {visibleTitle}
      </span>
    </td>
  );
}

function TvContentVideoModal({ item, onClose, videoRef }) {
  const closeButtonRef = useRef(null);
  const src = mediaUrl(item.fileUrl);
  const previewLabel = item.title || "Prévia do conteúdo";

  useEffect(() => {
    closeButtonRef.current?.focus();

    try {
      const playPromise = videoRef.current?.play?.();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    } catch {
      // Some browsers can still block autoplay even after opening from a click.
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, videoRef]);

  return (
    <div
      className="tc-previewModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Prévia de ${previewLabel}`}
      onClick={onClose}
    >
      <div className="tc-previewModal" onClick={(event) => event.stopPropagation()}>
        <button
          ref={closeButtonRef}
          className="tc-previewModalClose"
          type="button"
          aria-label="Fechar prévia"
          onClick={onClose}
        >
          x
        </button>
        <video
          ref={videoRef}
          className="tc-previewModalVideo"
          src={src}
          controls
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
}

export default function TvContentList({
  allBranches,
  error = "",
  items,
  loading,
  onEdit,
  onRemove,
  onRetry,
  onToggle,
}) {
  const [previewVideo, setPreviewVideo] = useState(null);
  const modalVideoRef = useRef(null);
  const openerRef = useRef(null);

  function openVideoPreview(item, opener) {
    openerRef.current = opener;
    setPreviewVideo(item);
  }

  const closeVideoPreview = useCallback(() => {
    const video = modalVideoRef.current;
    try {
      video?.pause?.();
    } catch {
      // Closing the modal should continue even when media controls are unavailable.
    }
    if (video) video.currentTime = 0;
    setPreviewVideo(null);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, []);

  return (
    <section className="tc-card">
      <div className="tc-cardHeader">
        <div className="tc-cardTitle">Conteúdos cadastrados</div>
        <div className="tc-pill">{items.length} total</div>
      </div>

      <div className="tc-tableWrap">
        <table className="tc-table">
          <thead>
            <tr>
              <th>Prévia</th>
              <th className="tc-titleCol">Título</th>
              <th>Tipo</th>
              <th>Tamanho</th>
              <th>Filiais</th>
              <th>Ordem</th>
              <th>Status</th>
              <th>Criado em</th>
              <th className="tc-actions-col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" className="tc-empty" aria-live="polite">
                  Carregando conteúdos...
                  <span className="tc-srOnly">Carregando conteúdos, aguarde...</span>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="9" className="tc-empty" role="alert">
                  <div>{error}</div>
                  <div>{TV_CONTENT_MESSAGES.loadRetry}</div>
                  {onRetry ? (
                    <button
                      className="tc-btn tc-btn-ghost tc-emptyAction"
                      type="button"
                      onClick={onRetry}
                    >
                      Tentar novamente
                    </button>
                  ) : null}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan="9" className="tc-empty">
                  <div>Nenhum conteúdo cadastrado.</div>
                  <div>Adicione um conteúdo para começar.</div>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className={item.isActive ? undefined : "tc-row-disabled"}>
                  <td>
                    <div className="tc-preview">
                      <TvContentPreview item={item} onOpenVideo={openVideoPreview} />
                    </div>
                  </td>
                  <TvContentTitleCell title={item.title} />
                  <td>{tvContentTypeLabel(item.type)}</td>
                  <td>{formatBytes(item.fileSize)}</td>
                  <td className="tc-branchCell">
                    <TvBranchList branches={item.branches} allBranches={allBranches} />
                  </td>
                  <td>{item.order ?? 0}</td>
                  <td>
                    <span className={`tc-status ${item.isActive ? "is-on" : "is-off"}`}>
                      {item.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <TvContentDateCell value={item.createdAt} />
                  </td>
                  <td>
                    <TvContentActions
                      item={item}
                      onEdit={onEdit}
                      onRemove={onRemove}
                      onToggle={onToggle}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {previewVideo ? (
        <TvContentVideoModal
          item={previewVideo}
          onClose={closeVideoPreview}
          videoRef={modalVideoRef}
        />
      ) : null}
    </section>
  );
}
