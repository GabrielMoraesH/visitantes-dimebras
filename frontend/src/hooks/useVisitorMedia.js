import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";

function revokeUrl(url) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // URL may already have been released by the browser.
  }
}

export default function useVisitorMedia(visitor) {
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoDbUrl, setPhotoDbUrl] = useState("");
  const [docFrontDbUrl, setDocFrontDbUrl] = useState("");
  const [docBackDbUrl, setDocBackDbUrl] = useState("");

  const urlsRef = useRef({
    photoPreviewUrl: "",
    photoDbUrl: "",
    docFrontDbUrl: "",
    docBackDbUrl: "",
  });

  const setTrackedUrl = useCallback((key, setter, nextUrl) => {
    const previousUrl = urlsRef.current[key];
    if (previousUrl && previousUrl !== nextUrl) revokeUrl(previousUrl);
    urlsRef.current[key] = nextUrl || "";
    setter(nextUrl || "");
  }, []);

  const clearPreview = useCallback(() => {
    setTrackedUrl("photoPreviewUrl", setPhotoPreviewUrl, "");
  }, [setTrackedUrl]);

  const clearStoredMedia = useCallback(() => {
    setTrackedUrl("photoDbUrl", setPhotoDbUrl, "");
    setTrackedUrl("docFrontDbUrl", setDocFrontDbUrl, "");
    setTrackedUrl("docBackDbUrl", setDocBackDbUrl, "");
  }, [setTrackedUrl]);

  const setPhotoPreviewFromBlob = useCallback((blob) => {
    const localUrl = URL.createObjectURL(blob);
    setTrackedUrl("photoPreviewUrl", setPhotoPreviewUrl, localUrl);
    return localUrl;
  }, [setTrackedUrl]);

  const clearAll = useCallback(() => {
    clearPreview();
    clearStoredMedia();
  }, [clearPreview, clearStoredMedia]);

  useEffect(() => {
    return () => {
      Object.values(urlsRef.current).forEach(revokeUrl);
      urlsRef.current = {
        photoPreviewUrl: "",
        photoDbUrl: "",
        docFrontDbUrl: "",
        docBackDbUrl: "",
      };
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchBlobAsUrl(endpoint) {
      const res = await api.get(endpoint, {
        responseType: "blob",
      });
      return URL.createObjectURL(res.data);
    }

    async function loadAll() {
      clearStoredMedia();

      if (!visitor?.id) return;

      if (visitor.photoUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/photo`);
          if (!cancelled) setTrackedUrl("photoDbUrl", setPhotoDbUrl, url);
          else revokeUrl(url);
        } catch {
          // Visitor may not have a photo stored yet.
        }
      }

      if (visitor.documentFrontUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/doc-front`);
          if (!cancelled) setTrackedUrl("docFrontDbUrl", setDocFrontDbUrl, url);
          else revokeUrl(url);
        } catch {
          // Visitor may not have a front document stored yet.
        }
      }

      if (visitor.documentBackUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/doc-back`);
          if (!cancelled) setTrackedUrl("docBackDbUrl", setDocBackDbUrl, url);
          else revokeUrl(url);
        } catch {
          // Visitor may not have a back document stored yet.
        }
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [
    clearStoredMedia,
    setTrackedUrl,
    visitor?.id,
    visitor?.photoUpdatedAt,
    visitor?.documentFrontUpdatedAt,
    visitor?.documentBackUpdatedAt,
  ]);

  useEffect(() => {
    if (!photoPreviewUrl) return;
    if (!visitor?.photoUpdatedAt) return;
    clearPreview();
  }, [clearPreview, photoPreviewUrl, visitor?.photoUpdatedAt]);

  const photoSrc = useMemo(() => {
    if (photoPreviewUrl) return photoPreviewUrl;
    return photoDbUrl || "";
  }, [photoPreviewUrl, photoDbUrl]);

  return {
    clearAll,
    clearPreview,
    docBackDbUrl,
    docFrontDbUrl,
    photoSrc,
    revokeUrl,
    setPhotoPreviewFromBlob,
  };
}
