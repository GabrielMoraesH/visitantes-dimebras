import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import authRoutes from "./routes/auth.routes.js";
import visitorsRoutes from "./routes/visitors.routes.js";
import visitsRoutes from "./routes/visits.routes.js";
import historyRoutes from "./routes/history.routes.js";
import usersRoutes from "./routes/users.routes.js";
import branchesRoutes from "./routes/branches.routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const UPLOAD_ROOT = process.env.UPLOAD_ROOT || "C:\\visitantes-nas";
app.use("/uploads", express.static(path.resolve(UPLOAD_ROOT)));

app.get("/health", (req, res) => {
  res.json({ ok: true, message: "Backend rodando ✅" });
});

app.use("/auth", authRoutes);
app.use("/visitors", visitorsRoutes);
app.use("/visits", visitsRoutes);
app.use("/history", historyRoutes);
app.use("/users", usersRoutes);
app.use("/branches", branchesRoutes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
  console.log(`📁 Uploads em: http://localhost:${PORT}/uploads`);
});
