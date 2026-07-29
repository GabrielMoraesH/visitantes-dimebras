import CameraModal from "../components/CameraModal";
import CadastroTopbar from "../components/visitor/CadastroTopbar";
import VisitorMediaSection from "../components/visitor/VisitorMediaSection";
import VisitorRegistrationForm from "../components/visitor/VisitorRegistrationForm";
import useCadastroVisitante from "../hooks/useCadastroVisitante";
import "../styles/cadastro.css";

export default function CadastroVisitante() {
  const {
    camera,
    fields,
    handlers,
    media,
    refs,
    submission,
    validation,
  } = useCadastroVisitante();

  return (
    <div className="cadastro-page">
      <CadastroTopbar
        onBack={handlers.onBack}
        onBrandClick={handlers.onBrandClick}
        saving={submission.saving}
      />

      <div className="cadastro-wrap">
        <div className="cadastro-card">
          <div className="cadastro-grid">
            <VisitorRegistrationForm
              company={fields.company}
              cpfDisplay={fields.cpfDisplay}
              cpfInputRef={refs.cpfInputRef}
              cpfFeedback={fields.cpfFeedback}
              cpfLookup={fields.cpfLookup}
              companyError={fields.companyError}
              companyInputRef={refs.companyInputRef}
              formMessageField={validation.formMessageField}
              formOk={validation.formOk}
              message={submission.message}
              name={fields.name}
              nameError={fields.nameError}
              nameInputRef={refs.nameInputRef}
              onBlurCompany={handlers.onBlurCompany}
              onBlurName={handlers.onBlurName}
              onBlurPhone={handlers.onBlurPhone}
              onChangeCompany={handlers.onChangeCompany}
              onChangeCpf={handlers.onChangeCpf}
              onChangeName={handlers.onChangeName}
              onChangePhone={handlers.onChangePhone}
              onCpfBlur={handlers.onCpfBlur}
              onCpfEnter={handlers.onCpfEnter}
              onSubmit={handlers.onSubmit}
              phoneDisplay={fields.phoneDisplay}
              phoneError={fields.phoneError}
              phoneInputRef={refs.phoneInputRef}
              saving={submission.saving}
            />

            <VisitorMediaSection
              docBack={media.docBack}
              docBackPreview={media.docBackPreview}
              docFront={media.docFront}
              docFrontPreview={media.docFrontPreview}
              captureButtonRefs={refs.cameraButtonRefs}
              docBackError={media.docBackError}
              onOpenCamera={handlers.onOpenCamera}
              docFrontError={media.docFrontError}
              photo={media.photo}
              photoError={media.photoError}
              photoPreview={media.photoPreview}
              saving={submission.saving}
            />

          </div>
        </div>
      </div>

      {camera.open && (
        <CameraModal
          captureTarget={camera.target}
          mode={camera.mode}
          onClose={camera.onClose}
          onCapture={camera.onCapture}
          returnFocusRef={camera.returnFocusRef}
        />
      )}
    </div>
  );
}
