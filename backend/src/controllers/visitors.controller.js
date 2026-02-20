import { prisma } from "../prisma.js";
import { z } from "zod";

function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

const createVisitorSchema = z.object({
  name: z.string().min(2),
  cpf: z.string().min(11).max(14),
  phone: z.string().optional(),
  company: z.string().optional(),
});

export async function getByCpf(req, res) {
  try {
    const cpf = onlyDigits(req.params.cpf);

    const visitor = await prisma.visitor.findUnique({
      where: { cpf },
      select: {
        id: true,
        name: true,
        cpf: true,
        phone: true,
        company: true,

        photoUpdatedAt: true,
        documentFrontUpdatedAt: true,
        documentBackUpdatedAt: true,

        photoMime: true,
        documentFrontMime: true,
        documentBackMime: true,

        createdAt: true,
        updatedAt: true,
      },
    });

    if (!visitor) return res.status(404).json({ message: "Visitante não encontrado" });

    return res.json(visitor);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function createVisitor(req, res) {
  try {
    const data = createVisitorSchema.parse(req.body);

    const cpf = onlyDigits(data.cpf);
    const phone = data.phone ? onlyDigits(data.phone) : null;

    const created = await prisma.visitor.create({
      data: {
        name: data.name,
        cpf,
        phone,
        company: data.company ?? null,
      },
      select: {
        id: true,
        name: true,
        cpf: true,
        phone: true,
        company: true,
        createdAt: true,
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados inválidos", issues: err.issues });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ message: "CPF já cadastrado" });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function updateVisitorFiles(req, res) {
  try {
    const id = Number(req.params.id);

    const photo = req.files?.photo?.[0];
    const documentFront = req.files?.documentFront?.[0];
    const documentBack = req.files?.documentBack?.[0];

    if (!photo && !documentFront && !documentBack) {
      return res
        .status(400)
        .json({ message: "Envie photo e/ou documentFront e/ou documentBack" });
    }

    const data = {};

    if (photo) {
      data.photoBytes = photo.buffer;
      data.photoMime = photo.mimetype;
      data.photoUpdatedAt = new Date();
    }

    if (documentFront) {
      data.documentFrontBytes = documentFront.buffer;
      data.documentFrontMime = documentFront.mimetype;
      data.documentFrontUpdatedAt = new Date();
    }

    if (documentBack) {
      data.documentBackBytes = documentBack.buffer;
      data.documentBackMime = documentBack.mimetype;
      data.documentBackUpdatedAt = new Date();
    }

    const updated = await prisma.visitor.update({
      where: { id },
      data,
      select: {
        id: true,
        cpf: true,
        photoUpdatedAt: true,
        documentFrontUpdatedAt: true,
        documentBackUpdatedAt: true,
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function getVisitorPhoto(req, res) {
  try {
    const id = Number(req.params.id);

    const v = await prisma.visitor.findUnique({
      where: { id },
      select: { photoBytes: true, photoMime: true, photoUpdatedAt: true },
    });

    if (!v?.photoBytes) return res.status(404).end();

    res.setHeader("Content-Type", v.photoMime || "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(v.photoBytes);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}

export async function getVisitorDocFront(req, res) {
  try {
    const id = Number(req.params.id);

    const v = await prisma.visitor.findUnique({
      where: { id },
      select: { documentFrontBytes: true, documentFrontMime: true, documentFrontUpdatedAt: true },
    });

    if (!v?.documentFrontBytes) return res.status(404).end();

    res.setHeader("Content-Type", v.documentFrontMime || "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(v.documentFrontBytes);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}

export async function getVisitorDocBack(req, res) {
  try {
    const id = Number(req.params.id);

    const v = await prisma.visitor.findUnique({
      where: { id },
      select: { documentBackBytes: true, documentBackMime: true, documentBackUpdatedAt: true },
    });

    if (!v?.documentBackBytes) return res.status(404).end();

    res.setHeader("Content-Type", v.documentBackMime || "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(v.documentBackBytes);
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}