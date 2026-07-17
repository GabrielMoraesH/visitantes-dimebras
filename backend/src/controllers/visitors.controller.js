import * as VisitorService from "../services/visitor.service.js";

function sendSensitiveFileHeaders(res, contentType) {
  res.setHeader("Content-Type", contentType || "image/jpeg");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
}

async function ensureVisitorFileAccess(req, res) {
  const access = await VisitorService.ensureFileAccess({
    user: req.user,
    id: req.params.id,
  });

  if (access.ok) return access.id;

  if (access.reason === "invalid-id") {
    res.status(400).json({ message: "ID inv\u00e1lido" });
    return null;
  }

  res.status(404).json({ message: "Visitante n\u00e3o encontrado." });
  return null;
}

function sendFileAccessError(res, result) {
  if (result.reason === "invalid-id") {
    res.status(400).json({ message: "ID inv\u00e1lido" });
    return true;
  }

  if (result.reason === "not-found") {
    res.status(404).json({ message: "Visitante n\u00e3o encontrado." });
    return true;
  }

  return false;
}

export async function getByCpf(req, res, next) {
  try {
    const result = await VisitorService.findByCpf({
      user: req.user,
      cpf: req.params.cpf,
    });

    if (!result.found) {
      const message = result.inaccessible ? "Visitante nao encontrado" : "Visitante n\u00e3o encontrado";
      return res.status(404).json({ message });
    }

    return res.json(result.visitor);
  } catch (error) {
    return next(error);
  }
}

export async function createVisitor(req, res, next) {
  try {
    const created = await VisitorService.create({
      user: req.user,
      body: req.body,
    });

    return res.status(201).json(created);
  } catch (error) {
    return next(error);
  }
}

export async function deleteIncompleteVisitorFromCurrentAttempt(req, res, next) {
  try {
    const result = await VisitorService.deleteIncompleteFromCurrentAttempt({
      user: req.user,
      id: req.params.id,
    });

    if (!result.deleted) {
      return res.status(404).json({ message: "Visitante nao encontrado" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function updateVisitor(req, res, next) {
  try {
    const result = await VisitorService.update({
      user: req.user,
      id: req.params.id,
      body: req.body,
    });

    if (!result.ok) {
      if (result.reason === "invalid-id") {
        return res.status(400).json({ message: "ID inv\u00e1lido" });
      }

      return res.status(404).json({ message: "Visitante nao encontrado" });
    }

    return res.json(result.visitor);
  } catch (error) {
    return next(error);
  }
}

export async function updateVisitorFiles(req, res, next) {
  try {
    const id = await ensureVisitorFileAccess(req, res);
    if (!id) return;

    const files = {
      photo: req.files?.photo?.[0],
      documentFront: req.files?.documentFront?.[0],
      documentBack: req.files?.documentBack?.[0],
    };

    if (!files.photo && !files.documentFront && !files.documentBack) {
      return res
        .status(400)
        .json({ message: "Envie photo e/ou documentFront e/ou documentBack" });
    }

    const result = await VisitorService.updateFiles({
      user: req.user,
      id,
      files,
    });
    if (sendFileAccessError(res, result)) return;

    if (!result.ok) {
      return res
        .status(result.validation.statusCode)
        .json({ message: result.validation.message });
    }

    return res.json(result.visitor);
  } catch (error) {
    return next(error);
  }
}

export async function getVisitorPhoto(req, res, next) {
  try {
    const result = await VisitorService.getPhoto({
      user: req.user,
      id: req.params.id,
    });
    if (sendFileAccessError(res, result)) return;

    const visitor = result.visitor;
    if (!visitor?.photoBytes) return res.status(404).end();

    sendSensitiveFileHeaders(res, visitor.photoMime);
    res.setHeader("Content-Length", visitor.photoBytes.length);
    return res.send(visitor.photoBytes);
  } catch (error) {
    return next(error);
  }
}

export async function getVisitorDocFront(req, res, next) {
  try {
    const result = await VisitorService.getDocumentFront({
      user: req.user,
      id: req.params.id,
    });
    if (sendFileAccessError(res, result)) return;

    const visitor = result.visitor;
    if (!visitor?.documentFrontBytes) return res.status(404).end();

    sendSensitiveFileHeaders(res, visitor.documentFrontMime);
    res.setHeader("Content-Length", visitor.documentFrontBytes.length);
    return res.send(visitor.documentFrontBytes);
  } catch (error) {
    return next(error);
  }
}

export async function getVisitorDocBack(req, res, next) {
  try {
    const result = await VisitorService.getDocumentBack({
      user: req.user,
      id: req.params.id,
    });
    if (sendFileAccessError(res, result)) return;

    const visitor = result.visitor;
    if (!visitor?.documentBackBytes) return res.status(404).end();

    sendSensitiveFileHeaders(res, visitor.documentBackMime);
    res.setHeader("Content-Length", visitor.documentBackBytes.length);
    return res.send(visitor.documentBackBytes);
  } catch (error) {
    return next(error);
  }
}
