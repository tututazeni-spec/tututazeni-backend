import express, { Request, Response, NextFunction } from 'express';
import enrollmentsRoutes from './routes/enrollmentsRoutes';

const app = express();

// Middleware para ler JSON
app.use(express.json());

// CORS simples para produção
app.use((_req: Request, res: Response, next: NextFunction): void => {
  res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// Registo das rotas
app.use("/enrollments", enrollmentsRoutes);

// Rota de health check — útil para verificar no browser após deploy
app.get("/health", (_req: Request, res: Response): void => {
  res.json({ status: "ok" });
});

// Rota raiz
app.get("/", (_req: Request, res: Response): void => {
  res.send("API Innova funcionando 🚀");
});

// Porta dinâmica — obrigatório no Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});