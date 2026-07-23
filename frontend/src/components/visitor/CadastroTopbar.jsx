export default function CadastroTopbar({ onBack, onBrandClick, saving }) {
  return (
    <header className="cadastro-topbar">
      <div
        className="cadastro-brand"
        role="button"
        tabIndex={0}
        onClick={onBrandClick}
        onKeyDown={(event) => event.key === "Enter" && onBrandClick()}
      >
        <img className="cadastro-logo" src="/logo.png" alt="Dimebras" />
      </div>

      <button className="cadastro-back" onClick={onBack} disabled={saving} type="button">
        VOLTAR
      </button>
    </header>
  );
}
