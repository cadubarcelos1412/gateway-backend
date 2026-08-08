import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/database";
import routes from "./routes"; // 📦 Importa automaticamente todas as rotas do index.ts em /routes

// 🧪 Carrega variáveis de ambiente
dotenv.config();

// 🛡️ Rede de segurança — um erro não tratado (ex.: CastError de
// User.findById com um id que não é ObjectId válido) derrubaria o processo
// Node inteiro (comportamento padrão desde o Node 15), tirando a API do ar
// pra TODOS os sellers por causa de UMA requisição malformada. Isso já
// aconteceu na prática (ver requireMasterUser em master.controller.ts).
// Só loga e segue — não é solução pros bugs em si (cada um deveria ter seu
// próprio try/catch), é a última linha de defesa pra eles não derrubarem o
// servidor inteiro enquanto não são corrigidos um a um.
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
});

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
