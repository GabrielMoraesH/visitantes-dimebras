import { formatCPF, formatDateTime, formatPhone, onlyDigits } from "../../utils/checkin";

export default function VisitorDetailsPanel({
  areaToVisit,
  attendedBy,
  companyEdit,
  loadingExtras,
  onAreaToVisitChange,
  onAttendedByChange,
  onCancel,
  onCompanyEditChange,
  onGenerateLabel,
  onPhoneEditChange,
  onReprintLabel,
  onSaveVisitor,
  openVisitId,
  phoneEdit,
  recentVisits,
  savingVisitor,
  serviceType,
  setServiceType,
  user,
  visitStats,
  visitor,
}) {
  return (
    <div className="card">
      <div className="kv">
        <div className="kv-label">CPF</div>
        <div className="kv-value">{formatCPF(visitor.cpf)}</div>
      </div>

      <div className="kv">
        <div className="kv-label">NOME COMPLETO</div>
        <div className="kv-value">{visitor.name}</div>
      </div>

      <div className="kv-row">
        <div className="kv">
          <div className="kv-label">EMPRESA</div>
          <div className="kv-value">
            <input
              className="input"
              value={companyEdit}
              onChange={(event) => onCompanyEditChange(event.target.value)}
              placeholder="Empresa..."
            />
          </div>
        </div>

        <div className="kv">
          <div className="kv-label">TELEFONE</div>
          <div className="kv-value">
            <input
              className="input"
              value={formatPhone(phoneEdit)}
              onChange={(event) => onPhoneEditChange(onlyDigits(event.target.value))}
              placeholder="Telefone..."
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div className="visitor-save-actions">
        <button className="btn btn-light" type="button" onClick={onSaveVisitor} disabled={savingVisitor}>
          {savingVisitor ? "SALVANDO..." : "SALVAR DADOS"}
        </button>
      </div>

      <div className="visit-box">
        <div className="visit-title">DETALHES DA VISITA</div>

        <div className="visit-grid">
          <input
            className="input"
            value={`Filial: ${user?.role === "ADMIN" ? "TODAS" : user?.branch?.name || "-"}`}
            readOnly
          />

          <select className="input" value={areaToVisit} onChange={(event) => onAreaToVisitChange(event.target.value)}>
            <option value="Logística">Setor: Logística</option>
            <option value="Comercial">Setor: Comercial</option>
            <option value="Financeiro">Setor: Financeiro</option>
            <option value="Recepção">Setor: Recepção</option>
            <option value="Diretoria">Setor: Diretoria</option>
            <option value="Compras">Setor: Compras</option>
            <option value="TI">Setor: TI</option>
          </select>

          <input
            className="input"
            placeholder="Falar com quem?"
            value={attendedBy}
            onChange={(event) => onAttendedByChange(event.target.value)}
          />

          <input
            className="input"
            placeholder="Motivo da visita?"
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value)}
          />
        </div>

        <div className="visit-actions">
          <button className="btn btn-link" onClick={onCancel} type="button">
            CANCELAR
          </button>

          {openVisitId ? (
            <button className="btn btn-light" onClick={onReprintLabel} type="button">
              REIMPRIMIR ETIQUETA
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onGenerateLabel} type="button">
              GERAR ETIQUETA
            </button>
          )}
        </div>
      </div>

      <div className="extras">
        <div className="extras-top">
          <div className="extras-card">
            <div className="extras-title">VISITAS</div>

            {loadingExtras ? (
              <div className="cpf-status">Carregando...</div>
            ) : (
              <div className="cpf-statTitle">
                <div className="cpf-statSingle">
                  <div className="cpf-statLabel">Total</div>
                  <div className="cpf-statValue">{visitStats?.total ?? 0}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="extras-card">
          <div className="extras-title">ÚLTIMAS VISITAS</div>

          {loadingExtras ? (
            <div className="extras-muted">Carregando...</div>
          ) : recentVisits.length === 0 ? (
            <div className="extras-muted">Nenhuma visita anterior.</div>
          ) : (
            <div className="mini-list">
              {recentVisits.map((visit) => (
                <div key={visit.id} className="mini-row">
                  <div className="mini-left">
                    <div className="mini-main">{formatDateTime(visit.checkinAt)}</div>
                    <div className="mini-sub">
                      {(visit.branchName || "-") + " • " + (visit.checkoutAt ? "Finalizada" : "Aberta")}
                    </div>
                  </div>
                  <div className="mini-right">
                    <div className="mini-code">{visit.visitCode}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
