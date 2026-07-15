import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";
import visitorsRoutes from "./routes/visitors.routes.js";
import visitsRoutes from "./routes/visits.routes.js";
import historyRoutes from "./routes/history.routes.js";
import usersRoutes from "./routes/users.routes.js";
import branchesRoutes from "./routes/branches.routes.js";
import agendaRoutes from "./routes/agenda.routes.js";
import tvContentRoutes from "./routes/tvContent.routes.js";
import { tvPublicPrefix, tvUploadDir } from "./config/uploads.js";
import prisma from "./lib/prisma.js";
import {
  errorHandler,
  normalizeErrorResponses,
  notFoundHandler,
} from "./middlewares/errorHandler.js";

const app = express();

app.set("trust proxy", 1);

function normalizeOrigin(origin) {
  return origin?.replace(/\/$/, "");
}

const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = isProduction
  ? [normalizeOrigin(process.env.FRONTEND_URL)].filter(Boolean)
  : ["http://localhost:5173"];

if (isProduction && !process.env.FRONTEND_URL) {
  console.error(
    "Erro de configuracao: FRONTEND_URL deve ser definida em producao para configurar o CORS."
  );
}

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }

      return callback(new Error("Origem nao permitida pelo CORS"));
    },
  })
);
app.use(express.json());
app.use(express.static("public"));
app.use(normalizeErrorResponses);

async function allowOnlyTvMediaFiles(req, res, next) {
  let pathname = "";
  try {
    pathname = decodeURIComponent(req.path || "");
  } catch {
    return res.status(404).end();
  }

  if (!/^\/[^/\\]+\.(jpe?g|png|webp|mp4|webm)$/i.test(pathname) || pathname.includes("..")) {
    return res.status(404).end();
  }

  try {
    const activeContent = await prisma.tvContent.findFirst({
      where: {
        fileUrl: `${tvPublicPrefix}${pathname}`,
        isActive: true,
      },
      select: { id: true },
    });

    if (!activeContent) return res.status(404).end();
    return next();
  } catch {
    return res.status(500).end();
  }
}

const staticUploadOptions = {
  dotfiles: "deny",
  index: false,
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
};
app.use(tvPublicPrefix, allowOnlyTvMediaFiles, express.static(tvUploadDir, staticUploadOptions));

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend rodando ✅" });
});

app.use("/auth", authRoutes);
app.use("/visitors", visitorsRoutes);
app.use("/visits", visitsRoutes);
app.use("/history", historyRoutes);
app.use("/users", usersRoutes);
app.use("/branches", branchesRoutes);
app.use("/agenda", agendaRoutes);
app.use("/tv-content", tvContentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);
    console.log(`Uploads TV em: ${tvUploadDir}`);
    console.log(`URL publica TV: http://localhost:${PORT}${tvPublicPrefix}`);
  });
}

export default app;