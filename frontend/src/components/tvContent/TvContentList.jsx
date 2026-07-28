import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatBytes,
  formatTvContentDate,
  mediaUrl,
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
  const src = mediaUrl(item.fileUrl);

  if (item.type === "IMAGE") {
    return <img src={src} alt={item.title} />;
  }

  function handleLoadedMetadata(event) {
    setDuration(formatVideoDuration(event.currentTarget.duration));
  }

  function handleDurationError() {
    setDuration("");
  }

  return (
    <button
      type="button"
      className="tc-videoPreviewButton"
      aria-label={`Reproduzir preview de ${item.title}`}
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

function TvContentVideoModal({ item, onClose, videoRef }) {
  const closeButtonRef = useRef(null);
  const src = mediaUrl(item.fileUrl);

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
      aria-label={`Preview de ${item.title}`}
      onClick={onClose}
    >
      <div className="tc-previewModal" onClick={(event) => event.stopPropagation()}>
        <button
          ref={closeButtonRef}
          className="tc-previewModalClose"
          type="button"
          aria-label="Fechar preview"
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
  items,
  loading,
  onEdit,
  onRemove,
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
        <div className="tc-cardTitle">Conteudos cadastrados</div>
        <div className="tc-pill">{items.length} total</div>
      </div>

      <div className="tc-tableWrap">
        <table className="tc-table">
          <thead>
            <tr>
              <th>Preview</th>
              <th>Título</th>
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
                <td colSpan="9" className="tc-empty">Carregando...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan="9" className="tc-empty">Nenhum conteúdo cadastrado.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className={item.isActive ? undefined : "tc-row-disabled"}>
                  <td>
                    <div className="tc-preview">
                      <TvContentPreview item={item} onOpenVideo={openVideoPreview} />
                    </div>
                  </td>
                  <td className="tc-titleCell">{item.title}</td>
                  <td>{tvContentTypeLabel(item.type)}</td>
                  <td>{formatBytes(item.fileSize)}</td>
                  <td className="tc-branchCell">
                    <TvBranchList branches={item.branches} allBranches={allBranches} />
                  </td>
                  <td>{item.order ?? 0}</td>
                  <td>
                    <span className={`tc-status ${item.isActive ? "is-on" : "is-off"}`}>
                      {item.isActive ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td>{formatTvContentDate(item.createdAt)}</td>
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
