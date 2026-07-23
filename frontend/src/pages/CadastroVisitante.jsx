import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import CameraModal from "../components/CameraModal";
import CadastroTopbar from "../components/visitor/CadastroTopbar";
import VisitorMediaSection from "../components/visitor/VisitorMediaSection";
import VisitorRegistrationForm from "../components/visitor/VisitorRegistrationForm";
import useVisitorRegistrationMedia from "../hooks/useVisitorRegistrationMedia";
import { getToken } from "../services/session";
import {
  buildVisitorFilesFormData,
  buildVisitorRegistrationPayload,
  formatCPF,
  formatPhone,
  getFirstVisitorRegistrationError,
  isValidCPF,
  isValidPhone,
  makeJpgFile,
  onlyDigits,
  uploadVisitorRegistrationErrorMessage,
} from "../utils/visitorRegistration";
import "../styles/cadastro.css";

export default function CadastroVisitante() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const cpfParam = useMemo(() => onlyDigits(searchParams.get("cpf") || ""), [searchParams]);
  const [cpfDigits, setCpfDigits] = useState(cpfParam);

  useEffect(() => {
    setCpfDigits(cpfParam);
  }, [cpfParam]);

  const cpfDisplay = useMemo(() => formatCPF(cpfDigits), [cpfDigits]);

  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [company, setCompany] = useState("");

  const {
    docBack,
    docBackPreview,
    docFront,
    docFrontPreview,
    mediaOk,
    photo,
    photoPreview,
    setMediaFile,
  } = useVisitorRegistrationMedia();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const cpfInputRef = useRef(null);

  const [cpfLookup, setCpfLookup] = useState({ status: "idle", message: "" });
  const lookupTimerRef = useRef(null);
  const lastLookupCpfRef = useRef("");
  const submittingRef = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) navigate("/login");
  }, [navigate]);

  const cpfOk = isValidCPF(cpfDigits);
  const phoneOk = isValidPhone(phoneDisplay);
  const nameOk = name.trim().length >= 3;
  const companyOk = company.trim().length >= 2;
  const { docBackOk, docFrontOk, photoOk } = mediaOk;

  const formOk =
    cpfOk && phoneOk && nameOk && companyOk && photoOk && docFrontOk && docBackOk && !saving;

  function getFirstError() {
    return getFirstVisitorRegistrationError({
      companyOk,
      cpfOk,
      docBackOk,
      docFrontOk,
      nameOk,
      phoneOk,
      photoOk,
    });
  }

  function openCamera(target) {
    setMsg("");
    setCameraTarget(target);
    setCameraOpen(true);
  }

  function handleCaptureBlob(blob) {
    const base = cpfDigits || "visitante";

    if (cameraTarget === "photo") {
      setMediaFile("photo", makeJpgFile(blob, `${base}-foto`));
    } else if (cameraTarget === "docFront") {
      setMediaFile("docFront", makeJpgFile(blob, `${base}-doc-frente`));
    } else if (cameraTarget === "docBack") {
      setMediaFile("docBack", makeJpgFile(blob, `${base}-doc-verso`));
    }

    setCameraOpen(false);
    setCameraTarget(null);
  }

  async function uploadVisitorFiles(visitorId) {
    return api.put(`/visitors/${visitorId}/files`, buildVisitorFilesFormData({ docBack, docFront, photo }), {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async function cleanupIncompleteVisitor(visitorId) {
    try {
      await api.delete(`/visitors/${visitorId}/incomplete-created`);
      return true;
    } catch {
      console.warn("Falha ao executar compensacao de visitante incompleto.");
      return false;
    }
  }

  function onChangeCpfInput(value) {
    setMsg("");
    const digits = onlyDigits(value).slice(0, 11);
    setCpfDigits(digits);

    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (digits) p.set("cpf", digits);
        else p.delete("cpf");
        return p;
      },
      { replace: true }
    );
  }

  async function lookupCpfAndGo(checkCpfDigits) {
    const digits = onlyDigits(checkCpfDigits).slice(0, 11);
    if (!isValidCPF(digits)) return false;

    if (lastLookupCpfRef.current === digits) return false;
    lastLookupCpfRef.current = digits;

    setCpfLookup({ status: "checking", message: "Verificando CPF..." });

    try {
      await api.get(`/visitors/by-cpf/${digits}`);

      setCpfLookup({ status: "exists", message: "CPF já cadastrado. Indo para o check-in..." });

      setTimeout(() => navigate(`/checkin?cpf=${digits}`), 250);
      return true;
    } catch (err) {
      const status = err?.response?.status;

      if (status === 404) {
        setCpfLookup({ status: "notfound", message: "" });
        return false;
      }

      setCpfLookup({
        status: "error",
        message: err?.response?.data?.message || "Erro ao verificar CPF",
      });
      return false;
    }
  }

  useEffect(() => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);

    setCpfLookup((prev) => (prev.status === "exists" ? prev : { status: "idle", message: "" }));
    lastLookupCpfRef.current = "";

    if (!cpfOk) return;

    lookupTimerRef.current = setTimeout(() => {
      lookupCpfAndGo(cpfDigits);
    }, 350);

    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpfDigits, cpfOk]);

  async function cadastrar() {
    if (submittingRef.current) return;

    const err = getFirstError();
    if (err) {
      setMsg(err);
      if (!cpfOk) {
        setTimeout(() => {
          cpfInputRef.current?.focus();
        }, 0);
      }
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setMsg("");

    let createdVisitorId = null;

    try {
      let created;
      try {
        const response = await api.post(
          "/visitors",
          buildVisitorRegistrationPayload({ company, cpfDigits, name, phoneDisplay })
        );
        created = response.data;
        createdVisitorId = created.id;
      } catch (createErr) {
        if (createErr?.response?.status !== 409) throw createErr;

        const existing = await api.get(`/visitors/by-cpf/${cpfDigits}`);
        created = existing.data;
      }

      try {
        await uploadVisitorFiles(created.id);
      } catch (uploadErr) {
        if (createdVisitorId) {
          const cleaned = await cleanupIncompleteVisitor(createdVisitorId);
          uploadErr.cleanupFailed = !cleaned;
        }
        throw uploadErr;
      }

      navigate(`/checkin?cpf=${cpfDigits}`);
    } catch (err2) {
      setMsg(uploadVisitorRegistrationErrorMessage(err2));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  async function handleCpfEnter(event) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    const redirected = await lookupCpfAndGo(cpfDigits);
    if (!redirected) cadastrar();
  }

  return (
    <div className="cadastro-page">
      <CadastroTopbar
        onBack={() => navigate(-1)}
        onBrandClick={() => navigate("/checkin")}
        saving={saving}
      />

      <div className="cadastro-wrap">
        <div className="cadastro-card">
          <div className="cadastro-grid">
            <VisitorMediaSection
              docBack={docBack}
              docBackPreview={docBackPreview}
              docFront={docFront}
              docFrontPreview={docFrontPreview}
              onOpenCamera={openCamera}
              photo={photo}
              photoPreview={photoPreview}
              saving={saving}
            />

            <VisitorRegistrationForm
              company={company}
              cpfDisplay={cpfDisplay}
              cpfInputRef={cpfInputRef}
              cpfLookup={cpfLookup}
              cpfOk={cpfOk}
              formOk={formOk}
              message={msg}
              name={name}
              onChangeCompany={setCompany}
              onChangeCpf={onChangeCpfInput}
              onChangeName={setName}
              onChangePhone={(value) => setPhoneDisplay(formatPhone(value))}
              onCpfEnter={handleCpfEnter}
              onSubmit={cadastrar}
              phoneDisplay={phoneDisplay}
              saving={saving}
            />
          </div>
        </div>
      </div>

      {cameraOpen && (
        <CameraModal
          mode={cameraTarget === "photo" ? "photo" : "document"}
          onClose={() => {
            setCameraOpen(false);
            setCameraTarget(null);
          }}
          onCapture={handleCaptureBlob}
        />
      )}
    </div>
  );
}
