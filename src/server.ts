import express, { Request, Response, NextFunction } from "express";
import enrollmentsRoutes from "./routes/enrollmentsRoutes";
import authRoutes from "./routes/authRoutes";

const app = express();

// Middleware para ler JSON
app.use(express.json());

// CORS — trata preflight OPTIONS obrigatório para o browser
app.use((req: Request, res: Response, next: NextFunction): void => {
  const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Responde imediatamente aos pedidos preflight
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// Registo das rotas
app.use("/auth", authRoutes);           // ← NOVO: rota de autenticação
app.use("/enrollments", enrollmentsRoutes);

// Health check
app.get("/health", (_req: Request, res: Response): void => {
  res.json({ status: "ok" });
});

// Rota raiz
app.get("/", (_req: Request, res: Response): void => {
  res.send("API Innova funcionando 🚀");
});

// IMPORTANTE: porta 4000 para não colidir com o Next.js (porta 3000)
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});