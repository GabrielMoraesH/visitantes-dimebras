import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function revokeLocalUrl(url) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // URL may already have been released by the browser.
  }
}

function createLocalPreview(file) {
  return file ? URL.createObjectURL(file) : "";
}

const emptyMedia = {
  docBack: null,
  docFront: null,
  photo: null,
};

const emptyPreviews = {
  docBack: "",
  docFront: "",
  photo: "",
};

export default function useVisitorRegistrationMedia() {
  const [files, setFiles] = useState(emptyMedia);
  const [previews, setPreviews] = useState(emptyPreviews);
  const previewsRef = useRef(emptyPreviews);

  const setMediaFile = useCallback((key, file) => {
    setFiles((current) => ({ ...current, [key]: file }));

    setPreviews((current) => {
      const nextUrl = createLocalPreview(file);
      revokeLocalUrl(previewsRef.current[key]);
      previewsRef.current = { ...previewsRef.current, [key]: nextUrl };
      return { ...current, [key]: nextUrl };
    });
  }, []);

  const clearMediaFile = useCallback((key) => {
    setMediaFile(key, null);
  }, [setMediaFile]);

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach(revokeLocalUrl);
      previewsRef.current = emptyPreviews;
    };
  }, []);

  const mediaOk = useMemo(() => ({
    docBackOk: !!files.docBack,
    docFrontOk: !!files.docFront,
    photoOk: !!files.photo,
  }), [files.docBack, files.docFront, files.photo]);

  return {
    clearMediaFile,
    docBack: files.docBack,
    docBackPreview: previews.docBack,
    docFront: files.docFront,
    docFrontPreview: previews.docFront,
    mediaOk,
    photo: files.photo,
    photoPreview: previews.photo,
    setMediaFile,
  };
}
