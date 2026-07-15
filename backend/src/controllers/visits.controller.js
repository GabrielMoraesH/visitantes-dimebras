import prisma from "../lib/prisma.js";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { userCanAccessVisitor } from "../utils/visitorAccess.js";
import {
  boundedLimitQuery,
  cpfSchema,
  idParamSchema,
  LIMITS,
  positiveIntBody,
  trimmedString,
} from "../utils/validation.js";

const numericCode = customAlphabet("0123456789", 8);
const LABEL_TOKEN_TTL_SECONDS = Math.max(
  300,
  Number(process.env.LABEL_TOKEN_TTL_SECONDS || 8 * 60 * 60)
);

function zodToIssues(err) {
  return err?.issues?.map((i) => ({
    path: i.path?.join(".") || "",
    message: i.message,
  })) || [];
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getBearerUser(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;

  try {
    const payload = jwt.verify(header.slice("Bearer ".length), process.env.JWT_SECRET);
    const id = Number(payload.sub ?? payload.id);

    if (!Number.isInteger(id) || id <= 0) return null;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });

    if (!user || user.isActive !== true) return null;

    return user;
  } catch {
    return null;
  }
}

function userCanAccessVisit(payload, visit) {
  const role = String(payload?.role || "").toUpperCase();
  if (role === "ADMIN") return true;
  return Number(payload?.branchId) === Number(visit.branchId);
}

function verifyLabelToken(req, visit) {
  const token = String(req.query.token || "");
  if (!token) return false;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return (
      payload?.purpose === "visit-label" &&
      Number(payload?.visitId) === Number(visit.id) &&
      Number(payload?.branchId) === Number(visit.branchId)
    );
  } catch {
    return false;
  }
}

const asString = (v) => (v === null || v === undefined ? "" : String(v));

const checkinSchema = z.object({
  visitorId: positiveIntBody("Visitante invalido"),

  areaToVisit: z
    .preprocess(asString, trimmedString(LIMITS.visitText, "Selecione o setor.")),

  attendedBy: z
    .preprocess(asString, trimmedString(LIMITS.visitText, "Informe com quem veio falar.").min(2, "Informe com quem veio falar.")),

  serviceType: z
    .preprocess(asString, trimmedString(LIMITS.visitText, "Informe o que veio fazer na empresa.").min(2, "Informe o que veio fazer na empresa.")),
}).strict();

export async function labelToken(req, res) {
  try {
    const { id: visitId } = idParamSchema.parse(req.params);

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true, branchId: true },
    });

    if (!visit) return res.status(404).json({ message: "Visita nao encontrada" });
    if (!userCanAccessVisit(req.user, visit)) {
      return res.status(403).json({ message: "Acesso negado" });
    }

    const token = jwt.sign(
      {
        purpose: "visit-label",
        visitId: visit.id,
        branchId: visit.branchId,
      },
      process.env.JWT_SECRET,
      { expiresIn: LABEL_TOKEN_TTL_SECONDS }
    );

    return res.json({ token, expiresInSeconds: LABEL_TOKEN_TTL_SECONDS });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function checkin(req, res) {
  try {
    const data = checkinSchema.parse(req.body);

    const branchId = Number(req.user?.branchId);
    if (!branchId) {
      return res.status(400).json({ message: "Usuário sem filial vinculada" });
    }

    const visitor = await prisma.visitor.findUnique({
      where: { id: data.visitorId },
    });

    if (!visitor) {
      return res.status(404).json({ message: "Visitante não encontrado" });
    }

    const canAccessVisitor = await userCanAccessVisitor(req.user, visitor.id);
    if (!canAccessVisitor) {
      return res.status(404).json({ message: "Visitante nao encontrado" });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true },
    });

    if (!branch) {
      return res.status(400).json({ message: "Filial do usuário inválida" });
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const photoMissing = !visitor.photoBytes || !visitor.photoMime;
    const frontMissing = !visitor.documentFrontBytes || !visitor.documentFrontMime;
    const backMissing = !visitor.documentBackBytes || !visitor.documentBackMime;

    const photoExpired = !visitor.photoUpdatedAt || visitor.photoUpdatedAt < sixMonthsAgo;
    const frontExpired =
      !visitor.documentFrontUpdatedAt || visitor.documentFrontUpdatedAt < sixMonthsAgo;
    const backExpired =
      !visitor.documentBackUpdatedAt || visitor.documentBackUpdatedAt < sixMonthsAgo;

    if (photoMissing || frontMissing || backMissing || photoExpired || frontExpired || backExpired) {
      return res.status(400).json({
        message: "Cadastro expirado. Atualização obrigatória.",
      });
    }

    const openVisit = await prisma.visit.findFirst({
      where: {
        visitorId: data.visitorId,
        checkoutAt: null,
        branchId: branch.id,
      },
    });

    if (openVisit) {
      return res.status(400).json({
        message: "Visitante já possui visita em andamento.",
      });
    }

    const visit = await prisma.visit.create({
      data: {
        visitCode: numericCode(),
        visitorId: data.visitorId,
        branchId: branch.id,
        branchName: branch.name,
        serviceType: data.serviceType,
        attendedBy: data.attendedBy,
        areaToVisit: data.areaToVisit,
        checkinByUserId: req.user.id,
      },
    });

    return res.status(201).json(visit);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inválidos",
        issues: err.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }

    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function label(req, res) {
  try {
    const { id: visitId } = idParamSchema.parse(req.params);

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        visitor: {
          select: {
            name: true,
            cpf: true,
            company: true,
          },
        },
        branch: { select: { id: true, name: true } },
      },
    });

    if (!visit) {
      return res.status(404).send("Visita não encontrada");
    }

    const bearerUser = await getBearerUser(req);
    const hasBearerAccess = bearerUser && userCanAccessVisit(bearerUser, visit);
    const hasTokenAccess = verifyLabelToken(req, visit);

    if (!hasBearerAccess && !hasTokenAccess) {
      return res.status(404).send("Visita nao encontrada");
    }

    const qrDataUrl = await QRCode.toDataURL(visit.visitCode, {
      margin: 0,
      scale: 8,
    });

    const visitorName = escapeHtml(visit.visitor.name);
    const visitorCpf = escapeHtml(visit.visitor.cpf);
    const visitorCompany = escapeHtml(visit.visitor.company ?? "-");
    const attendedBy = escapeHtml(visit.attendedBy ?? "-");
    const branchName = escapeHtml(visit.branch.name);
    const checkinAt = escapeHtml(new Date(visit.checkinAt).toLocaleString("pt-BR"));
    const visitCode = escapeHtml(visit.visitCode);
    const scriptNonce = randomBytes(16).toString("base64");
    const logoUrl = "/api/LogoPreta.png";

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Etiqueta</title>

          <style>
            @page {
              size: 100mm 60mm;
              margin: 0;
            }

            body {
              margin: 0;
              font-family: Arial, sans-serif;
            }

            .tag {
              width: 100mm;
              height: 60mm;
              box-sizing: border-box;
              padding: 6mm;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .info {
              flex: 1;
              padding-right: 6mm;
            }

            .label-logo {
              display: block;
              height: 9mm;
              width: auto;
              max-width: 48mm;
              object-fit: contain;
              margin-bottom: 3mm;
            }

            h2 {
              margin: 0 0 3mm 0;
              font-size: 16px;
            }

            p {
              margin: 1.5mm 0;
              font-size: 11px;
            }

            .small {
              font-size: 9px;
            }

            .code {
              font-size: 16px;
            }

            .qr {
              width: 30mm;
              height: 30mm;
            }

            .actions {
              position: fixed;
              top: 12px;
              right: 12px;
              display: flex;
              gap: 8px;
            }

            button {
              border: 0;
              border-radius: 6px;
              padding: 10px 14px;
              background: #111827;
              color: #fff;
              cursor: pointer;
              font: 700 12px Arial, sans-serif;
            }

            button.secondary {
              background: #e5e7eb;
              color: #111827;
            }

            @media print {
              body {
              margin: 0;
            }

            .actions {
              display: none;
            }
          }
        </style>
      </head>

    <body>
      <div class="actions">
        <button id="print-button" type="button">IMPRIMIR</button>
        <button id="close-button" type="button" class="secondary">
          FECHAR
        </button>
      </div>

      <div class="tag">
        <div class="info">
          <img
            src="${logoUrl}"
            alt="Dimebras"
            class="label-logo"
          />

          <p><b>Nome:</b> ${visitorName}</p>
          <p><b>CPF:</b> ${visitorCpf}</p>
          <p><b>Empresa:</b> ${visitorCompany}</p>
          <p><b>Falar com:</b> ${attendedBy}</p>
          <p class="small"><b>Unidade:</b> ${branchName}</p>
          <p class="small"><b>Entrada:</b> ${checkinAt}</p>
          <p class="code"><b>Código:</b> ${visitCode}</p>
        </div>

        <img class="qr" src="${qrDataUrl}" alt="QR Code da visita" />
      </div>

      <script nonce="${scriptNonce}">
        document
          .getElementById("print-button")
          ?.addEventListener("click", () => window.print());

        document
          .getElementById("close-button")
          ?.addEventListener("click", () => window.close());
      </script>
    </body>
  </html>
`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'none'",
        "img-src 'self' data:",
        "style-src 'unsafe-inline'",
        `script-src 'nonce-${scriptNonce}'`,
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; ")
    );
    return res.send(html);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Erro ao gerar etiqueta");
  }
}

const checkoutSchema = z.object({
  visitCode: z
    .string()
    .trim()
    .min(6, "QR invalido (codigo muito curto)")
    .max(LIMITS.visitCode, "QR invalido"),
}).strict();

export async function openByCpf(req, res) {
  try {
    const cpf = cpfSchema.parse(req.params.cpf);

    const visit = await prisma.visit.findFirst({
      where: {
        checkoutAt: null,
        visitor: { cpf },
        branchId: req.user.branchId,
      },
      orderBy: { checkinAt: "desc" },
      select: {
        id: true,
        visitCode: true,
        checkinAt: true,
        visitor: { select: { name: true, cpf: true } },
      },
    });

    if (!visit) {
      return res.status(404).json({ message: "Nenhuma visita em aberto" });
    }

    return res.json(visit);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function statsByCpf(req, res) {
  try {
    const cpf = cpfSchema.parse(req.params.cpf);
    const role = String(req.user?.role || "").toUpperCase();
    const where = { visitor: { is: { cpf } } };

    if (role === "RECEPCAO") {
      where.branchId = req.user.branchId;
    }

    const [total, open] = await Promise.all([
      prisma.visit.count({
        where,
      }),
      prisma.visit.count({
        where: { ...where, checkoutAt: null },
      }),
    ]);

    return res.json({ cpf, total, open, closed: total - open });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao carregar estatísticas" });
  }
}

export async function recentByCpf(req, res) {
  try {
    const cpf = cpfSchema.parse(req.params.cpf);
    const limit = boundedLimitQuery(20, 5).parse(req.query.limit);
    const role = String(req.user?.role || "").toUpperCase();
    const where = { visitor: { is: { cpf } } };

    if (role === "RECEPCAO") {
      where.branchId = req.user.branchId;
    }

    const items = await prisma.visit.findMany({
      where,
      orderBy: { checkinAt: "desc" },
      take: limit,
      select: {
        id: true,
        checkinAt: true,
        checkoutAt: true,
        branchName: true,
        attendedBy: true,
        serviceType: true,
        visitCode: true,
      },
    });

    return res.json({ cpf, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao carregar últimas visitas" });
  }
}

export async function checkout(req, res) {
  try {
    const { visitCode } = checkoutSchema.parse(req.body);

    const visit = await prisma.visit.findFirst({
      where: {
        visitCode,
        checkoutAt: null,
        branchId: req.user.branchId,
      },
    });

    if (!visit) {
      return res
        .status(404)
        .json({ message: "Visita em aberto não encontrada." });
    }

    const updated = await prisma.visit.update({
      where: { id: visit.id },
      data: {
        checkoutAt: new Date(),
        checkoutByUserId: req.user?.id ?? null,
      },
    });

    return res.json(updated);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inválidos",
        issues: zodToIssues(err),
      });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function getVisitById(req, res) {
  try {
    const { id } = idParamSchema.parse(req.params);

    const visit = await prisma.visit.findUnique({
      where: { id },
      include: {
        visitor: {
          select: {
            id: true,
            name: true,
            cpf: true,
            phone: true,
            company: true,
            photoUpdatedAt: true,
            documentFrontUpdatedAt: true,
            documentBackUpdatedAt: true,
          },
        },
        branch: { select: { id: true, name: true } },
        checkinByUser: { select: { id: true, username: true } },
        checkoutByUser: { select: { id: true, username: true } },
      },
    });

    if (!visit) return res.status(404).json({ message: "Visita não encontrada" });

    const isAdmin = String(req.user?.role || "").toUpperCase() === "ADMIN";
    const sameBranch = Number(req.user?.branchId) === Number(visit.branch?.id);

    if (!isAdmin && !sameBranch) {
      return res.status(404).json({ message: "Visita nao encontrada" });
    }
    return res.json(visit);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}
export async function getOpenVisitsMyBranch(req, res) {
  try {
    const isAdmin = String(req.user?.role || "").toUpperCase() === "ADMIN";
    const branchId = Number(req.user?.branchId);

    const where = { checkoutAt: null };

    if (!isAdmin) {
      if (!branchId) return res.json({ items: [] });
      where.branchId = branchId;
    }

    const items = await prisma.visit.findMany({
      where,
      orderBy: { checkinAt: "desc" },
      take: 50,
      select: {
        id: true,
        checkinAt: true,
        areaToVisit: true,
        attendedBy: true,
        serviceType: true,
        visitCode: true,
        branchId: true,
        branchName: true,
        visitor: {
          select: {
            name: true,
            cpf: true,
            company: true,
          },
        },
      },
    });

    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao carregar check-ins em aberto" });
  }
}
