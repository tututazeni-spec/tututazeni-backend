import express from "express";
import enrollmentsRoutes from "./routes/enrollmentsRoutes.js";

const app = express();

// Middleware para ler JSON
app.use(express.json());

/*
  REGISTRO DAS ROTAS
  Aqui é onde você registra todas as rotas da API
*/
app.use("/enrollments", enrollmentsRoutes);

// Rota de teste
app.get("/", (req, res) => {
  res.send("API funcionando 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});