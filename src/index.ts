import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/database";
import routes from "./routes"; // 📦 Importa automaticamente todas as rotas do index.ts em /routes

// 🧪 Carrega variáveis de ambiente
dotenv.config();

// 🚀 Inicializa a aplicação Express
const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------------------------------------------
🧰 Middlewares globais
-------------------------------------------------------- */
app.use(cors()); // 🔓 Libera acesso ao front-end (ajuste origins se quiser mais segurança)
app.use(express.json()); // 📦 Permite receber JSON no corpo das requisições

/* -------------------------------------------------------
🔌 Conexão com o banco de dados MongoDB
-------------------------------------------------------- */
connectDB();

/* -------------------------------------------------------
🛣️ Registro das rotas principais
-------------------------------------------------------- */
// Todas as rotas da aplicação estão centralizadas no arquivo /routes/index.ts
app.use("/api", routes);

/* -------------------------------------------------------
🌐 Rota base - verificação rápida do status da API
-------------------------------------------------------- */
app.get("/", (_req: Request, res: Response) => {
  res.status(200).send("🚀 API do Gateway rodando com sucesso!");
});

/* -------------------------------------------------------
🚀 Inicialização do servidor
-------------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
