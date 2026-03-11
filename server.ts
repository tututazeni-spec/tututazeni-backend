import express from "express";
import enrollmentsRoutes from "./routes/enrollmentsRoutes"; // ajuste o caminho conforme seu projeto

// Cria a instância do Express
const app = express();

// Middlewares
app.use(express.json()); // para interpretar JSON no corpo das requisições

// Rotas
app.use("/enrollments", enrollmentsRoutes);

// Rota raiz
app.get("/", (req, res) => {
  res.send("API rodando!");
});

// Porta do servidor
const PORT = process.env.PORT || 3000;

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});