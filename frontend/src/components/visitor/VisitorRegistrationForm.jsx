export default function VisitorRegistrationForm({
  company,
  cpfDisplay,
  cpfInputRef,
  cpfFeedback = "neutral",
  cpfLookup,
  companyError = "",
  companyInputRef,
  formMessageField = "",
  formOk,
  message,
  name,
  nameError = "",
  nameInputRef,
  onBlurCompany,
  onBlurName,
  onBlurPhone,
  onChangeCompany,
  onChangeCpf,
  onChangeName,
  onChangePhone,
  onCpfBlur,
  onCpfEnter,
  onSubmit,
  phoneDisplay,
  phoneError = "",
  phoneInputRef,
  saving,
  showSubmit = true,
}) {
  const cpfIsValid = cpfFeedback === "valid";
  const cpfIsInvalid = cpfFeedback === "invalid";
  const alertId = "cadastro-form-alert";
  const companyInputId = "cadastro-company";
  const companyErrorId = "cadastro-company-error";
  const cpfStatusId = "cadastro-cpf-status";
  const cpfInputId = "cadastro-cpf";
  const nameInputId = "cadastro-name";
  const nameErrorId = "cadastro-name-error";
  const phoneInputId = "cadastro-phone";
  const phoneErrorId = "cadastro-phone-error";
  const cpfBadgeClass = ["cadastro-cpfBadge", cpfIsValid ? "ok" : "", cpfIsInvalid ? "bad" : ""]
    .filter(Boolean)
    .join(" ");
  const cpfDescribedBy = [cpfIsValid || cpfIsInvalid ? cpfStatusId : "", formMessageField === "cpf" ? alertId : ""]
    .filter(Boolean)
    .join(" ");
  const nameDescribedBy = [nameError ? nameErrorId : "", formMessageField === "name" ? alertId : ""]
    .filter(Boolean)
    .join(" ");
  const phoneDescribedBy = [phoneError ? phoneErrorId : "", formMessageField === "phone" ? alertId : ""]
    .filter(Boolean)
    .join(" ");
  const companyDescribedBy = [companyError ? companyErrorId : "", formMessageField === "company" ? alertId : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="cadastro-fields">
      <div className="cadastro-head">
        <div className="cadastro-titleBlock">
          <h3 className="cadastro-title">Cadastrar Visitante</h3>
          <p className="cadastro-description">Preencha os dados e capture as imagens do visitante.</p>
        </div>

        <div className={cpfBadgeClass}>
          <label className="cadastro-cpfLabel" htmlFor={cpfInputId}>
            CPF
          </label>
          <input
            id={cpfInputId}
            ref={cpfInputRef}
            className="cadastro-cpfInput"
            value={cpfDisplay}
            onChange={(event) => onChangeCpf(event.target.value)}
            onBlur={onCpfBlur}
            onKeyDown={onCpfEnter}
            inputMode="numeric"
            disabled={saving}
            placeholder="Digite o CPF"
            autoComplete="off"
            aria-describedby={cpfDescribedBy || undefined}
            aria-invalid={cpfIsInvalid ? "true" : "false"}
          />
        </div>
      </div>

      {cpfIsValid && (
        <div className="cadastro-cpfOk" id={cpfStatusId}>
          CPF válido
        </div>
      )}
      {cpfIsInvalid && (
        <div className="cadastro-cpfWarn" id={cpfStatusId}>
          CPF inválido
        </div>
      )}

      {cpfLookup.status === "checking" && <div className="cadastro-info">Verificando CPF...</div>}
      {cpfLookup.status === "exists" && <div className="cadastro-info ok">{cpfLookup.message}</div>}
      {cpfLookup.status === "error" && <div className="cadastro-info bad">{cpfLookup.message}</div>}

      {message && (
        <div className="alert" id={alertId}>
          {message}
        </div>
      )}

      <div className="cadastro-form">
        <div className="cadastro-field">
          <label className="cadastro-label" htmlFor={nameInputId}>
            Nome completo
          </label>
          <input
            id={nameInputId}
            ref={nameInputRef}
            className="input"
            placeholder="Ex: João da Silva"
            value={name}
            onChange={(event) => onChangeName(event.target.value)}
            onBlur={onBlurName}
            disabled={saving}
            autoComplete="name"
            aria-describedby={nameDescribedBy || undefined}
            aria-invalid={nameError ? "true" : "false"}
          />
          {nameError && (
            <div className="cadastro-fieldError" id={nameErrorId}>
              {nameError}
            </div>
          )}
        </div>

        <div className="cadastro-field">
          <label className="cadastro-label" htmlFor={phoneInputId}>
            Telefone
          </label>
          <input
            id={phoneInputId}
            ref={phoneInputRef}
            className="input"
            placeholder="(45) 99999-9999"
            value={phoneDisplay}
            onChange={(event) => onChangePhone(event.target.value)}
            onBlur={onBlurPhone}
            disabled={saving}
            inputMode="numeric"
            autoComplete="tel"
            aria-describedby={phoneDescribedBy || undefined}
            aria-invalid={phoneError ? "true" : "false"}
          />
          {phoneError && (
            <div className="cadastro-fieldError" id={phoneErrorId}>
              {phoneError}
            </div>
          )}
        </div>

        <div className="cadastro-field">
          <label className="cadastro-label" htmlFor={companyInputId}>
            Empresa
          </label>
          <input
            id={companyInputId}
            ref={companyInputRef}
            className="input"
            placeholder="Ex: Transportadora X"
            value={company}
            onChange={(event) => onChangeCompany(event.target.value)}
            onBlur={onBlurCompany}
            disabled={saving}
            autoComplete="organization"
            aria-describedby={companyDescribedBy || undefined}
            aria-invalid={companyError ? "true" : "false"}
          />
          {companyError && (
            <div className="cadastro-fieldError" id={companyErrorId}>
              {companyError}
            </div>
          )}
        </div>

        {showSubmit && (
          <VisitorRegistrationSubmit formOk={formOk} onSubmit={onSubmit} saving={saving} />
        )}
      </div>
    </div>
  );
}

export function VisitorRegistrationSubmit({ formOk, onSubmit, saving }) {
  return (
    <div className="cadastro-submit">
      
      <div className="cadastro-note">
        * Foto do visitante + documento (frente e verso) são obrigatórios para liberar o check-in.
      </div>

      <button
        className="btn btn-primary w-full btn-lg"
        onClick={onSubmit}
        disabled={!formOk}
        title={!formOk ? "Preencha todos os campos e tire as fotos obrigatórias" : ""}
        type="button"
      >
        {saving ? "SALVANDO..." : "SALVAR"}
      </button>

      <div className="cadastro-savingStatus" role="status" aria-live="polite">
        {saving && (
          <span className="cadastro-savingStatusInner">
            <span className="cadastro-savingSpinner" aria-hidden="true" />
            <span>Salvando cadastro, aguarde...</span>
          </span>
        )}
      </div>
    </div>
  );
}
