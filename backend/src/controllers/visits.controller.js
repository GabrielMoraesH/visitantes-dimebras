import QRCode from "qrcode";
import { randomBytes } from "crypto";
import * as visitService from "../services/visit.service.js";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendServiceError(res, result) {
  return res.status(result.status).json({ message: result.message });
}

function buildLabelHtml({ visit, qrDataUrl, scriptNonce }) {
  const visitorName = escapeHtml(visit.visitor.name);
  const visitorCpf = escapeHtml(visit.visitor.cpf);
  const visitorCompany = escapeHtml(visit.visitor.company ?? "-");
  const attendedBy = escapeHtml(visit.attendedBy ?? "-");
  const branchName = escapeHtml(visit.branch.name);
  const checkinAt = escapeHtml(new Date(visit.checkinAt).toLocaleString("pt-BR"));
  const visitCode = escapeHtml(visit.visitCode);
  const logoUrl = "/api/LogoPreta.png";

  return `
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
}

export async function labelToken(req, res, next) {
  try {
    const result = await visitService.createLabelToken({ user: req.user, visitId: req.params.id });

    if (!result.ok) return sendServiceError(res, result);

    return res.json({ token: result.token, expiresInSeconds: result.expiresInSeconds });
  } catch (error) {
    return next(error);
  }
}

export async function checkin(req, res, next) {
  try {
    const result = await visitService.checkin({ user: req.user, input: req.body });

    if (!result.ok) return sendServiceError(res, result);

    return res.status(201).json(result.visit);
  } catch (error) {
    return next(error);
  }
}

export async function label(req, res) {
  try {
    const result = await visitService.getLabelData({
      authorization: req.headers.authorization,
      visitId: req.params.id,
      labelToken: req.query.token,
    });

    if (!result.ok) return res.status(result.status).send(result.message);

    const qrDataUrl = await QRCode.toDataURL(result.visit.visitCode, {
      margin: 0,
      scale: 8,
    });

    const scriptNonce = randomBytes(16).toString("base64");
    const html = buildLabelHtml({ visit: result.visit, qrDataUrl, scriptNonce });

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

export async function openByCpf(req, res, next) {
  try {
    const result = await visitService.findOpenByCpf({ user: req.user, cpf: req.params.cpf });

    if (!result.ok) return sendServiceError(res, result);

    return res.json(result.visit);
  } catch (error) {
    return next(error);
  }
}

export async function statsByCpf(req, res, next) {
  try {
    const stats = await visitService.getStatsByCpf({ user: req.user, cpf: req.params.cpf });

    return res.json(stats);
  } catch (error) {
    return next(error);
  }
}

export async function recentByCpf(req, res, next) {
  try {
    const recent = await visitService.getRecentByCpf({
      user: req.user,
      cpf: req.params.cpf,
      limit: req.query.limit,
    });

    return res.json(recent);
  } catch (error) {
    return next(error);
  }
}

export async function checkout(req, res, next) {
  try {
    const result = await visitService.checkout({ user: req.user, input: req.body });

    if (!result.ok) return sendServiceError(res, result);

    return res.json(result.visit);
  } catch (error) {
    return next(error);
  }
}

export async function getVisitById(req, res, next) {
  try {
    const result = await visitService.getById({ user: req.user, visitId: req.params.id });

    if (!result.ok) return sendServiceError(res, result);

    return res.json(result.visit);
  } catch (error) {
    return next(error);
  }
}

export async function getOpenVisitsMyBranch(req, res, next) {
  try {
    const result = await visitService.listOpen({ user: req.user });

    return res.json({ items: result.items });
  } catch (error) {
    return next(error);
  }
}
