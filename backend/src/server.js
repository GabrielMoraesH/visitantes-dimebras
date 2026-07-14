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

const staticUploadOptions = {
  dotfiles: "deny",
  index: false,
  setHeaders(res) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
};
app.use(tvPublicPrefix, express.static(tvUploadDir, staticUploadOptions));

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

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
  console.log(`📁 Uploads TV em: ${tvUploadDir}`);
  console.log(`🔗 URL publica TV: http://localhost:${PORT}${tvPublicPrefix}`);
});
