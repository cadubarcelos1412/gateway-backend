"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./config/database");
const routes_1 = __importDefault(require("./routes")); // 📦 Importa automaticamente todas as rotas do index.ts em /routes
// 🧪 Carrega variáveis de ambiente
dotenv_1.default.config();
// 🚀 Inicializa a aplicação Express
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
/* -------------------------------------------------------
🧰 Middlewares globais
-------------------------------------------------------- */
app.use((0, cors_1.default)()); // 🔓 Libera acesso ao front-end (ajuste origins se quiser mais segurança)
app.use(express_1.default.json()); // 📦 Permite receber JSON no corpo das requisições
/* -------------------------------------------------------
🔌 Conexão com o banco de dados MongoDB
-------------------------------------------------------- */
(0, database_1.connectDB)();
/* -------------------------------------------------------
🛣️ Registro das rotas principais
-------------------------------------------------------- */
// Todas as rotas da aplicação estão centralizadas no arquivo /routes/index.ts
app.use("/api", routes_1.default);
/* -------------------------------------------------------
🌐 Rota base - verificação rápida do status da API
-------------------------------------------------------- */
app.get("/", (_req, res) => {
    res.status(200).send("🚀 API do Gateway rodando com sucesso!");
});
/* -------------------------------------------------------
🚀 Inicialização do servidor
-------------------------------------------------------- */
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
