import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CameraModal from "../components/CameraModal";
import Header from "../components/Header";
import OpenVisitsList from "../components/checkin/OpenVisitsList";
import QrModal from "../components/QrModal";
import VisitorDetailsPanel from "../components/checkin/VisitorDetailsPanel";
import VisitorMediaCard from "../components/checkin/VisitorMediaCard";
import VisitorSearch from "../components/checkin/VisitorSearch";
import { useToast } from "../components/Feedback/ToastProvider";
import useOpenVisits from "../hooks/useOpenVisits";
import useVisitorMedia from "../hooks/useVisitorMedia";
import api, { openVisitLabel } from "../services/api";
import { clearSession, getToken, getUser } from "../services/session";
import {
  buildVisitorImageFile,
  isOlderThan6Months,
  onlyDigits,
  uploadErrorMessage,
} from "../utils/checkin";
import "../styles/checkin.css";

const DEFAULT_AREA_TO_VISIT = "Logística";

export default function Checkin() {
  const navigate = useNavigate();
  const toast = useToast();

  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === "ADMIN";

  const [showQr, setShowQr] = useState(false);
  const [cpf, setCpf] = useState("");
  const [visitor, setVisitor] = useState(null);
  const [msg, setMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState([]);

  const [areaToVisit, setAreaToVisit] = useState(DEFAULT_AREA_TO_VISIT);
  const [attendedBy, setAttendedBy] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [openVisitId, setOpenVisitId] = useState(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [updatingFiles, setUpdatingFiles] = useState(false);

  const [visitStats, setVisitStats] = useState(null);
  const [recentVisits, setRecentVisits] = useState([]);
  const [loadingExtras, setLoadingExtras] = useState(false);

  const [companyEdit, setCompanyEdit] = useState("");
  const [phoneEdit, setPhoneEdit] = useState("");
  const [savingVisitor, setSavingVisitor] = useState(false);

  const cpfInputRef = useRef(null);
  const updatingFilesRef = useRef(false);

  const showToast = useCallback((text, type = "success") => {
    toast[type]?.(text) ?? toast.show(text, type);
  }, [toast]);

  const handleOpenVisitsError = useCallback((text) => showToast(text, "error"), [showToast]);

  const {
    initialLoadingOpenVisits,
    loadOpenVisits,
    loadingOpenVisits,
    openVisits,
    refreshingOpenVisits,
  } = useOpenVisits({
    onError: handleOpenVisitsError,
  });

  const {
    clearAll: clearVisitorMedia,
    clearPreview,
    docBackDbUrl,
    docFrontDbUrl,
    photoSrc,
    setPhotoPreviewFromBlob,
  } = useVisitorMedia(visitor);

  useEffect(() => {
    const token = getToken();
    if (!token) navigate("/login");
  }, [navigate]);

  const resetVisitForm = useCallback(() => {
    setAttendedBy("");
    setServiceType("");
    setAreaToVisit(DEFAULT_AREA_TO_VISIT);
  }, []);

  const clearVisitorSelection = useCallback(() => {
    setVisitor(null);
    setOpenVisitId(null);
    setMsg("");
    setFieldErrors([]);
    resetVisitForm();
    setVisitStats(null);
    setRecentVisits([]);
    clearPreview();
  }, [clearPreview, resetVisitForm]);

  const resetTela = useCallback(() => {
    window.history.replaceState({}, "", "/checkin");
    setCpf("");
    clearVisitorSelection();
    setTimeout(() => cpfInputRef.current?.focus(), 0);
  }, [clearVisitorSelection]);

  const loadExtrasByCpf = useCallback(async (cpfDigits) => {
    if (!cpfDigits) return;
    try {
      setLoadingExtras(true);
      const [statsResponse, recentResponse] = await Promise.all([
        api.get(`/visits/stats-by-cpf/${cpfDigits}`),
        api.get(`/visits/recent-by-cpf/${cpfDigits}?limit=5`),
      ]);

      setVisitStats(statsResponse.data);
      setRecentVisits(Array.isArray(recentResponse.data?.items) ? recentResponse.data.items : []);
    } catch {
      setVisitStats(null);
      setRecentVisits([]);
    } finally {
      setLoadingExtras(false);
    }
  }, []);

  const buscarVisitaAberta = useCallback(async (cpfDigits) => {
    try {
      const { data } = await api.get(`/visits/open-by-cpf/${cpfDigits}`);
      setOpenVisitId(data.id);
      return data;
    } catch {
      setOpenVisitId(null);
      return null;
    }
  }, []);

  const buscarComCpf = useCallback(async (cpfDigits) => {
    setMsg("");
    setFieldErrors([]);
    setVisitor(null);
    setOpenVisitId(null);
    setVisitStats(null);
    setRecentVisits([]);
    clearVisitorMedia();

    try {
      const { data } = await api.get(`/visitors/by-cpf/${cpfDigits}`);

      setVisitor(data);
      setCompanyEdit(data.company || "");
      setPhoneEdit(data.phone || "");

      await buscarVisitaAberta(cpfDigits);
      await loadExtrasByCpf(cpfDigits);
    } catch (err) {
      if (err?.response?.status === 404) {
        navigate(`/cadastro?cpf=${encodeURIComponent(cpfDigits)}`);
      } else {
        setMsg(err?.response?.data?.message || "Erro ao buscar");
      }
    }
  }, [buscarVisitaAberta, clearVisitorMedia, loadExtrasByCpf, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cpfFromUrl = params.get("cpf");
    if (cpfFromUrl) {
      const digits = onlyDigits(cpfFromUrl);
      setCpf(digits);
      buscarComCpf(digits);
    }
  }, [buscarComCpf]);

  const photoExpired = useMemo(() => {
    if (!visitor) return false;
    return !visitor.photoUpdatedAt || isOlderThan6Months(visitor.photoUpdatedAt);
  }, [visitor]);

  const docExpired = useMemo(() => {
    if (!visitor) return false;

    const frontMissing = !visitor.documentFrontUpdatedAt;
    const backMissing = !visitor.documentBackUpdatedAt;
    const frontExpired = isOlderThan6Months(visitor.documentFrontUpdatedAt);
    const backExpired = isOlderThan6Months(visitor.documentBackUpdatedAt);

    return frontMissing || backMissing || frontExpired || backExpired;
  }, [visitor]);

  const noPendingUpdates = useMemo(() => {
    if (!visitor) return false;
    return !photoExpired && !docExpired;
  }, [visitor, photoExpired, docExpired]);

  function logout() {
    clearSession();
    navigate("/login");
  }

  async function buscar() {
    const cpfDigits = onlyDigits(cpf);
    await buscarComCpf(cpfDigits);
  }

  async function refreshVisitor() {
    if (!visitor?.cpf) return;
    const { data } = await api.get(`/visitors/by-cpf/${onlyDigits(visitor.cpf)}`);
    setVisitor(data);
    setCompanyEdit(data.company || "");
    setPhoneEdit(data.phone || "");
  }

  async function uploadVisitorFile(blob, fieldName, fileSuffix, successMessage, fallbackErrorMessage) {
    if (!visitor?.id) return;
    if (updatingFilesRef.current) return;

    try {
      updatingFilesRef.current = true;
      setUpdatingFiles(true);
      setMsg("");
      setFieldErrors([]);

      const fd = new FormData();
      fd.set(fieldName, buildVisitorImageFile(blob, visitor.cpf, fileSuffix));

      await api.put(`/visitors/${visitor.id}/files`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setCameraOpen(false);
      setCameraTarget(null);
      await refreshVisitor();
      showToast(successMessage, "success");
      return true;
    } catch (err) {
      setMsg(uploadErrorMessage(err, fallbackErrorMessage));
      showToast(fallbackErrorMessage, "error");
      return false;
    } finally {
      updatingFilesRef.current = false;
      setUpdatingFiles(false);
    }
  }

  async function atualizarFoto(blob) {
    if (!visitor?.id) return;
    if (updatingFilesRef.current) return;

    setPhotoPreviewFromBlob(blob);

    const updated = await uploadVisitorFile(blob, "photo", "foto", "Foto atualizada!", "Erro ao atualizar foto");
    if (!updated) {
      clearPreview();
    }
  }

  async function atualizarDocFrente(blob) {
    await uploadVisitorFile(
      blob,
      "documentFront",
      "doc-frente",
      "Documento (frente) atualizado!",
      "Erro ao atualizar documento (frente)"
    );
  }

  async function atualizarDocVerso(blob) {
    await uploadVisitorFile(
      blob,
      "documentBack",
      "doc-verso",
      "Documento (verso) atualizado!",
      "Erro ao atualizar documento (verso)"
    );
  }

  function openCamera(target) {
    setMsg("");
    setFieldErrors([]);
    setCameraTarget(target);
    setCameraOpen(true);
  }

  function handleCapture(blob) {
    if (cameraTarget === "photo") return atualizarFoto(blob);
    if (cameraTarget === "docFront") return atualizarDocFrente(blob);
    if (cameraTarget === "docBack") return atualizarDocVerso(blob);
  }

  function reimprimirEtiqueta() {
    if (!openVisitId) return;
    openVisitLabel(openVisitId);
  }

  async function salvarDadosVisitante() {
    if (!visitor?.id) return;

    try {
      setSavingVisitor(true);
      setMsg("");
      setFieldErrors([]);

      await api.put(`/visitors/${visitor.id}`, {
        company: companyEdit?.trim() || "",
        phone: onlyDigits(phoneEdit),
      });

      showToast("Dados atualizados!", "success");
      await refreshVisitor();
    } catch (err) {
      showToast(err?.response?.data?.message || "Erro ao salvar", "error");
    } finally {
      setSavingVisitor(false);
    }
  }

  async function gerarEtiqueta() {
    if (!visitor?.id) return;

    setMsg("");
    setFieldErrors([]);

    try {
      const payload = {
        visitorId: visitor.id,
        areaToVisit: areaToVisit ?? "",
        attendedBy: attendedBy ?? "",
        serviceType: serviceType ?? "",
      };

      const { data } = await api.post("/visits/checkin", payload);

      setOpenVisitId(null);
      showToast("Check-in concluído! Etiqueta gerada.", "success");
      openVisitLabel(data.id);
      await loadOpenVisits({ silent: true });
      resetTela();
    } catch (err) {
      const resp = err?.response?.data;
      const message = resp?.message || "Erro ao gerar etiqueta";
      const details = resp?.details || resp?.issues;

      if (Array.isArray(details) && details.length > 0) {
        setFieldErrors(details.map((item) => ({ path: item.path || item.field, message: item.message })));
        setMsg("");
        showToast("Verifique os campos obrigatórios", "error");
      } else {
        setMsg(message);
      }

      if (
        resp?.code === "VISITOR_OPEN_VISIT_CONFLICT" ||
        String(message).toLowerCase().includes("visita em andamento")
      ) {
        await buscarVisitaAberta(onlyDigits(visitor?.cpf || cpf));
      }
    }
  }

  return (
    <div className="checkin-page">
      <Header showQr onQrClick={() => setShowQr(true)} onLogout={logout} />

      <main className="checkin-container">
        <VisitorSearch
          cpf={cpf}
          cpfInputRef={cpfInputRef}
          fieldErrors={fieldErrors}
          message={msg}
          onCpfChange={setCpf}
          onSubmit={buscar}
        />

        <OpenVisitsList
          initialLoading={initialLoadingOpenVisits}
          isAdmin={isAdmin}
          loading={loadingOpenVisits}
          onOpenLabel={openVisitLabel}
          onRefresh={() => loadOpenVisits({ silent: true })}
          openVisits={openVisits}
          refreshing={refreshingOpenVisits}
        />

        {visitor && (
          <section className="grid-2">
            <VisitorMediaCard
              docBackUrl={docBackDbUrl}
              docExpired={docExpired}
              docFrontUrl={docFrontDbUrl}
              noPendingUpdates={noPendingUpdates}
              onOpenCamera={openCamera}
              photoExpired={photoExpired}
              photoSrc={photoSrc}
              updatingFiles={updatingFiles}
            />

            <VisitorDetailsPanel
              areaToVisit={areaToVisit}
              attendedBy={attendedBy}
              companyEdit={companyEdit}
              loadingExtras={loadingExtras}
              onAreaToVisitChange={setAreaToVisit}
              onAttendedByChange={setAttendedBy}
              onCancel={clearVisitorSelection}
              onCompanyEditChange={setCompanyEdit}
              onGenerateLabel={gerarEtiqueta}
              onPhoneEditChange={setPhoneEdit}
              onReprintLabel={reimprimirEtiqueta}
              onSaveVisitor={salvarDadosVisitante}
              openVisitId={openVisitId}
              phoneEdit={phoneEdit}
              recentVisits={recentVisits}
              savingVisitor={savingVisitor}
              serviceType={serviceType}
              setServiceType={setServiceType}
              user={user}
              visitStats={visitStats}
              visitor={visitor}
            />
          </section>
        )}
      </main>

      {showQr && (
        <QrModal
          onClose={() => setShowQr(false)}
          onToast={(text, type) => showToast(text, type)}
          onCheckoutDone={() => loadOpenVisits({ silent: true })}
        />
      )}

      {cameraOpen && (
        <CameraModal
          onClose={() => {
            setCameraOpen(false);
            setCameraTarget(null);
          }}
          onCapture={handleCapture}
        />
      )}
    </div>
  );
}
