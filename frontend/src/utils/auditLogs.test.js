import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  auditActionTone,
  auditLoadErrorMessage,
  auditBranchLabel,
  auditUserLabel,
  buildAuditLogParams,
  displayAuditValue,
  formatAuditActionLabel,
  formatAuditDateTime,
  formatAuditEntityLabel,
  formatMetadata,
  hasAuditFilters,
} from "./auditLogs";

describe("auditLogs utils", () => {
  it("builds params with defaults and omits empty filters", () => {
    expect(
      buildAuditLogParams(
        {
          action: "LOGIN",
          entity: "",
          userId: "  ",
          branchId: "3",
          entityId: "55",
          from: "2026-08-03",
          to: "2026-08-04",
          requestId: "req-1",
        },
        2,
        25
      )
    ).toEqual({
      page: 2,
      pageSize: 25,
      action: "LOGIN",
      branchId: "3",
      entityId: "55",
      from: "2026-08-03",
      to: "2026-08-04",
      requestId: "req-1",
    });
  });

  it("formats labels, null values, metadata and Sao Paulo date/time", () => {
    expect(AUDIT_ACTIONS).toEqual([
      "LOGIN",
      "VISITOR_CREATE",
      "VISITOR_UPDATE",
      "VISITOR_FILES_UPDATE",
      "CHECKIN",
      "CHECKOUT",
      "TV_CONTENT_CREATE",
      "TV_CONTENT_UPDATE",
      "TV_CONTENT_ACTIVATE",
      "TV_CONTENT_DEACTIVATE",
      "TV_CONTENT_DELETE",
      "AGENDA_EVENT_CREATE",
      "AGENDA_EVENT_UPDATE",
      "AGENDA_EVENT_DEACTIVATE",
      "USER_CREATE",
      "USER_UPDATE",
      "USER_ACTIVATE",
      "USER_DEACTIVATE",
      "VISIT_LABEL_GENERATE",
    ]);
    expect(AUDIT_ENTITIES).toEqual(["AUTH", "VISITOR", "VISIT", "TV_CONTENT", "AGENDA_EVENT", "USER"]);
    expect(formatAuditActionLabel("LOGIN")).toBe("Login");
    expect(formatAuditActionLabel("VISITOR_CREATE")).toBe("Visitante criado");
    expect(formatAuditActionLabel("VISITOR_UPDATE")).toBe("Visitante atualizado");
    expect(formatAuditActionLabel("VISITOR_FILES_UPDATE")).toBe("Documentos do visitante atualizados");
    expect(formatAuditActionLabel("CHECKIN")).toBe("Check-in");
    expect(formatAuditActionLabel("CHECKOUT")).toBe("Check-out");
    expect(formatAuditActionLabel("TV_CONTENT_CREATE")).toBe("Conteúdo de TV criado");
    expect(formatAuditActionLabel("TV_CONTENT_UPDATE")).toBe("Conteúdo de TV atualizado");
    expect(formatAuditActionLabel("TV_CONTENT_ACTIVATE")).toBe("Conteúdo de TV ativado");
    expect(formatAuditActionLabel("TV_CONTENT_DEACTIVATE")).toBe("Conteúdo de TV desativado");
    expect(formatAuditActionLabel("TV_CONTENT_DELETE")).toBe("Conteúdo de TV excluído");
    expect(formatAuditActionLabel("AGENDA_EVENT_CREATE")).toBe("Evento de agenda criado");
    expect(formatAuditActionLabel("AGENDA_EVENT_UPDATE")).toBe("Evento de agenda atualizado");
    expect(formatAuditActionLabel("AGENDA_EVENT_DEACTIVATE")).toBe("Evento de agenda cancelado");
    expect(formatAuditActionLabel("USER_CREATE")).toBe("Usuário criado");
    expect(formatAuditActionLabel("USER_UPDATE")).toBe("Usuário atualizado");
    expect(formatAuditActionLabel("USER_ACTIVATE")).toBe("Usuário ativado");
    expect(formatAuditActionLabel("USER_DEACTIVATE")).toBe("Usuário desativado");
    expect(formatAuditActionLabel("VISIT_LABEL_GENERATE")).toBe("Etiqueta de visita gerada");
    expect(formatAuditActionLabel("FUTURE_ACTION")).toBe("FUTURE_ACTION");
    expect(auditActionTone("FUTURE_ACTION")).toBe("neutral");
    expect(auditActionTone("VISITOR_UPDATE")).toBe("info");
    expect(auditActionTone("TV_CONTENT_CREATE")).toBe("success");
    expect(auditActionTone("TV_CONTENT_UPDATE")).toBe("info");
    expect(auditActionTone("TV_CONTENT_ACTIVATE")).toBe("success");
    expect(auditActionTone("TV_CONTENT_DEACTIVATE")).toBe("warning");
    expect(auditActionTone("TV_CONTENT_DELETE")).toBe("danger");
    expect(auditActionTone("AGENDA_EVENT_CREATE")).toBe("success");
    expect(auditActionTone("AGENDA_EVENT_UPDATE")).toBe("info");
    expect(auditActionTone("AGENDA_EVENT_DEACTIVATE")).toBe("warning");
    expect(auditActionTone("USER_CREATE")).toBe("success");
    expect(auditActionTone("USER_UPDATE")).toBe("info");
    expect(auditActionTone("USER_ACTIVATE")).toBe("success");
    expect(auditActionTone("USER_DEACTIVATE")).toBe("warning");
    expect(auditActionTone("VISIT_LABEL_GENERATE")).toBe("info");
    expect(formatAuditEntityLabel("AUTH")).toBe("Autenticação");
    expect(formatAuditEntityLabel("VISITOR")).toBe("Visitante");
    expect(formatAuditEntityLabel("VISIT")).toBe("Visita");
    expect(formatAuditEntityLabel("TV_CONTENT")).toBe("Conteúdo TV");
    expect(formatAuditEntityLabel("AGENDA_EVENT")).toBe("Agenda");
    expect(formatAuditEntityLabel("USER")).toBe("Usuário");
    expect(formatAuditEntityLabel("FUTURE_ENTITY")).toBe("FUTURE_ENTITY");
    expect(auditUserLabel({ user: null })).toBe("Usuário removido");
    expect(auditBranchLabel({ branch: null })).toBe("Sem filial");
    expect(displayAuditValue(null)).toBe("—");
    expect(displayAuditValue("  ")).toBe("—");
    expect(displayAuditValue("req-1")).toBe("req-1");
    expect(formatMetadata({ ok: true })).toBe('{\n  "ok": true\n}');
    expect(formatMetadata(null)).toBe("Sem metadados");
    expect(formatAuditDateTime("2026-08-03T15:30:00.000Z")).toBe("03/08/2026 12:30");
  });

  it("detects active filters and maps load errors", () => {
    expect(hasAuditFilters({ action: "", pageSize: 50 })).toBe(false);
    expect(hasAuditFilters({ action: "LOGIN", pageSize: 50 })).toBe(true);
    expect(auditLoadErrorMessage(new Error("Network Error"))).toBe(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."
    );
    expect(auditLoadErrorMessage({ response: { status: 403, data: { message: "Forbidden" } } })).toBe(
      "Você não tem permissão para acessar a Auditoria."
    );
    expect(auditLoadErrorMessage({ response: { status: 500, data: { message: "Prisma stack" } } })).toBe(
      "Não foi possível carregar os registros de auditoria. Tente novamente em alguns instantes."
    );
    expect(auditLoadErrorMessage({ response: { status: 400, data: { message: "ZodError stack" } } })).toBe(
      "Não foi possível carregar os registros de auditoria. Tente novamente."
    );
  });
});
