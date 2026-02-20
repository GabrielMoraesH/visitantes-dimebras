import { prisma } from "../prisma.js";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import QRCode from "qrcode";

const numericCode = customAlphabet("0123456789", 8);

function zodToIssues(err) {
  return err?.issues?.map((i) => ({
    path: i.path?.join(".") || "",
    message: i.message,
  })) || [];
}

const asString = (v) => (v === null || v === undefined ? "" : String(v));

const checkinSchema = z.object({
  visitorId: z.number(),

  branchName: z
    .preprocess(asString, z.string().trim().min(1, "Selecione a filial")),

  areaToVisit: z
    .preprocess(asString, z.string().trim().min(1, "Selecione o setor.")),

  attendedBy: z
    .preprocess(asString, z.string().trim().min(2, "Informe com quem veio falar.")),

  serviceType: z
    .preprocess(asString, z.string().trim().min(2, "Informe o que veio fazer na empresa.")),
});

export async function checkin(req, res) {
  try {
    const data = checkinSchema.parse(req.body);

    const visitor = await prisma.visitor.findUnique({
      where: { id: data.visitorId },
    });

    if (!visitor) {
      return res.status(404).json({ message: "Visitante não encontrado" });
    }

    const branch = await prisma.branch.findFirst({
      where: { name: data.branchName },
      select: { id: true, name: true },
    });

    if (!branch) {
      return res.status(400).json({ message: "Filial inválida" });
    }


    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const photoMissing =
      !visitor.photoBytes || !visitor.photoMime;

    const frontMissing =
      !visitor.documentFrontBytes || !visitor.documentFrontMime;

    const backMissing =
      !visitor.documentBackBytes || !visitor.documentBackMime;

    const photoExpired =
      !visitor.photoUpdatedAt ||
      visitor.photoUpdatedAt < sixMonthsAgo;

    const frontExpired =
      !visitor.documentFrontUpdatedAt ||
      visitor.documentFrontUpdatedAt < sixMonthsAgo;

    const backExpired =
      !visitor.documentBackUpdatedAt ||
      visitor.documentBackUpdatedAt < sixMonthsAgo;

    if (
      photoMissing ||
      frontMissing ||
      backMissing ||
      photoExpired ||
      frontExpired ||
      backExpired
    ) {
      return res.status(400).json({
        message: "Cadastro expirado. Atualização obrigatória.",
      });
    }

    const openVisit = await prisma.visit.findFirst({
      where: {
        visitorId: data.visitorId,
        checkoutAt: null,
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
    const visitId = Number(req.params.id);

    const visit = await prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        visitor: true,
        branch: true,
      },
    });

    if (!visit) {
      return res.status(404).send("Visita não encontrada");
    }

    const qrDataUrl = await QRCode.toDataURL(visit.visitCode, {
      margin: 0,
      scale: 8,
    });

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
24.04.4lts
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

            .code{
            font-size: 16px;
            }
            
            .qr {
              width: 30mm;
              height: 30mm;
            }

            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body onload="window.print()">
          <div class="tag">
            <div class="info">
              <h2>DIMEBRAS</h2>
              <p><b>Nome:</b> ${visit.visitor.name}</p>
              <p><b>CPF:</b> ${visit.visitor.cpf}</p>
              <p><b>Empresa:</b> ${visit.visitor.company ?? "-"}</p>
              <p><b>Falar com:</b> ${visit.attendedBy ?? "-"}</p>
              <p class="small"><b>Unidade:</b> ${visit.branch.name}</p>
              <p class="small"><b>Entrada:</b> ${new Date(
                visit.checkinAt
              ).toLocaleString("pt-BR")}</p>
              <p class="code"><b>Código:</b> ${visit.visitCode}</p>
            </div>

            <img class="qr" src="${qrDataUrl}" />
          </div>
        </body>
      </html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Erro ao gerar etiqueta");
  }
}

const checkoutSchema = z.object({
  visitCode: z.string().min(6, "QR inválido (código muito curto)"),
});

export async function openByCpf(req, res) {
  try {
    const { cpf } = req.params;

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

export async function checkout(req, res) {
  try {
    const { visitCode } = checkoutSchema.parse(req.body);

    const visit = await prisma.visit.findFirst({
      where: {
        visitCode,
        checkoutAt: null,
      },
    });

    if (!visit) {
      return res
        .status(404)
        .json({ message: "Visita não encontrada ou já finalizada" });
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