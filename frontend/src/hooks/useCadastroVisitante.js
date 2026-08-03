import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { getToken } from "../services/session";
import {
  buildVisitorFilesFormData,
  buildVisitorRegistrationPayload,
  buildVisitorWithFilesFormData,
  formatCPF,
  formatPhone,
  getFirstVisitorRegistrationError,
  isValidCPF,
  isValidPhone,
  makeJpgFile,
  onlyDigits,
  uploadVisitorRegistrationErrorMessage,
} from "../utils/visitorRegistration";
import useVisitorRegistrationMedia from "./useVisitorRegistrationMedia";

export default function useCadastroVisitante() {
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
  const nameInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const companyInputRef = useRef(null);
  const docBackCameraButtonRef = useRef(null);
  const docFrontCameraButtonRef = useRef(null);
  const photoCameraButtonRef = useRef(null);
  const cameraButtonRefs = {
    docBack: docBackCameraButtonRef,
    docFront: docFrontCameraButtonRef,
    photo: photoCameraButtonRef,
  };

  const [cpfLookup, setCpfLookup] = useState({ status: "idle", message: "" });
  const [cpfTouched, setCpfTouched] = useState(false);
  const [fieldTouched, setFieldTouched] = useState({
    company: false,
    name: false,
    phone: false,
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const lookupTimerRef = useRef(null);
  const lastLookupCpfRef = useRef("");
  const submittingRef = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (!token) navigate("/login");
  }, [navigate]);

  const cpfOk = isValidCPF(cpfDigits);
  const cpfComplete = cpfDigits.length === 11;
  const showCpfInvalid = !cpfOk && ((cpfTouched && cpfComplete) || submitAttempted);
  const cpfFeedback = cpfOk ? "valid" : showCpfInvalid ? "invalid" : "neutral";
  const phoneOk = isValidPhone(phoneDisplay);
  const nameOk = name.trim().length >= 3;
  const companyOk = company.trim().length >= 2;
  const { docBackOk, docFrontOk, photoOk } = mediaOk;
  const showNameInvalid = !nameOk && (submitAttempted || (fieldTouched.name && !name.trim()));
  const showPhoneInvalid = !phoneOk && (submitAttempted || (fieldTouched.phone && !onlyDigits(phoneDisplay)));
  const showCompanyInvalid = !companyOk && (submitAttempted || (fieldTouched.company && !company.trim()));
  const showPhotoInvalid = !photoOk && submitAttempted;
  const showDocFrontInvalid = !docFrontOk && submitAttempted;
  const showDocBackInvalid = !docBackOk && submitAttempted;
  const formMessageField = !msg
    ? ""
    : !cpfOk
      ? "cpf"
      : !nameOk
        ? "name"
        : !phoneOk
          ? "phone"
          : !companyOk
            ? "company"
            : "";

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

  function closeCamera() {
    setCameraOpen(false);
    setCameraTarget(null);
  }

  function focusFirstInvalidField() {
    const firstInvalidRef = !cpfOk
      ? cpfInputRef
      : !nameOk
        ? nameInputRef
        : !phoneOk
          ? phoneInputRef
          : !companyOk
            ? companyInputRef
            : !photoOk
              ? photoCameraButtonRef
              : !docFrontOk
                ? docFrontCameraButtonRef
                : !docBackOk
                  ? docBackCameraButtonRef
                  : null;

    if (firstInvalidRef) {
      setTimeout(() => {
        firstInvalidRef.current?.focus({ preventScroll: true });
      }, 0);
    }
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

    closeCamera();
  }

  async function uploadVisitorFiles(visitorId) {
    return api.put(`/visitors/${visitorId}/files`, buildVisitorFilesFormData({ docBack, docFront, photo }), {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  function isVisitorWithFilesEndpointUnavailable(err) {
    const status = err?.response?.status;
    const code = err?.response?.data?.code;
    return status === 404 || status === 405 || (!status && code === "VISITOR_WITH_FILES_ENDPOINT_NOT_FOUND");
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

  async function submitVisitorLegacyFlow() {
    let createdVisitorId = null;
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
  }

  async function submitVisitorWithFiles() {
    return api.post(
      "/visitors/with-files",
      buildVisitorWithFilesFormData({ company, cpfDigits, docBack, docFront, name, phoneDisplay, photo })
    );
  }

  async function submitExistingVisitorFiles() {
    const existing = await api.get(`/visitors/by-cpf/${cpfDigits}`);
    await uploadVisitorFiles(existing.data.id);
  }

  function onChangeCpfInput(value) {
    setMsg("");
    const digits = onlyDigits(value).slice(0, 11);
    setCpfDigits(digits);
    setSubmitAttempted(false);

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

  function handleFieldBlur(field) {
    setFieldTouched((current) => ({ ...current, [field]: true }));
  }

  async function lookupCpfAndGo(checkCpfDigits) {
    const digits = onlyDigits(checkCpfDigits).slice(0, 11);
    if (!isValidCPF(digits)) return false;

    if (lastLookupCpfRef.current === digits) return false;
    lastLookupCpfRef.current = digits;

    setCpfLookup({ status: "checking", message: "Verificando CPF..." });

    try {
      await api.get(`/visitors/by-cpf/${digits}`);

      setCpfLookup({ status: "exists", message: "CPF ja cadastrado. Indo para o check-in..." });

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

    setSubmitAttempted(true);

    const err = getFirstError();
    if (err) {
      setMsg(err);
      focusFirstInvalidField();
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setMsg("");

    try {
      try {
        await submitVisitorWithFiles();
      } catch (submitErr) {
        if (submitErr?.response?.status === 409) {
          await submitExistingVisitorFiles();
        } else if (isVisitorWithFilesEndpointUnavailable(submitErr)) {
          // Fallback temporario para deploys onde o frontend novo chega antes da rota transacional.
          await submitVisitorLegacyFlow();
        } else {
          throw submitErr;
        }
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

  return {
    camera: {
      mode: cameraTarget === "photo" ? "photo" : "document",
      onCapture: handleCaptureBlob,
      onClose: closeCamera,
      open: cameraOpen,
      returnFocusRef: cameraButtonRefs[cameraTarget],
      target: cameraTarget,
    },
    fields: {
      company,
      companyError: showCompanyInvalid ? "Campo obrigatorio: empresa." : "",
      cpfDisplay,
      cpfFeedback,
      cpfLookup,
      name,
      nameError: showNameInvalid ? "Campo obrigatorio: nome completo." : "",
      phoneDisplay,
      phoneError: showPhoneInvalid ? "Campo invalido: telefone (minimo 10 digitos)." : "",
    },
    handlers: {
      onBack: () => navigate(-1),
      onBlurCompany: () => handleFieldBlur("company"),
      onBlurName: () => handleFieldBlur("name"),
      onBlurPhone: () => handleFieldBlur("phone"),
      onBrandClick: () => navigate("/checkin"),
      onChangeCompany: (value) => {
        setMsg("");
        setCompany(value);
      },
      onChangeCpf: onChangeCpfInput,
      onChangeName: (value) => {
        setMsg("");
        setName(value);
      },
      onChangePhone: (value) => {
        setMsg("");
        setPhoneDisplay(formatPhone(value));
      },
      onCpfBlur: () => setCpfTouched(true),
      onCpfEnter: handleCpfEnter,
      onOpenCamera: openCamera,
      onSubmit: cadastrar,
    },
    media: {
      docBack,
      docBackError: showDocBackInvalid ? "Fotografe o verso do documento." : "",
      docBackPreview,
      docFront,
      docFrontError: showDocFrontInvalid ? "Fotografe a frente do documento." : "",
      docFrontPreview,
      photo,
      photoError: showPhotoInvalid ? "Fotografe o visitante." : "",
      photoPreview,
    },
    refs: {
      cameraButtonRefs,
      companyInputRef,
      cpfInputRef,
      nameInputRef,
      phoneInputRef,
    },
    submission: {
      message: msg,
      saving,
    },
    validation: {
      formMessageField,
      formOk,
    },
  };
}
