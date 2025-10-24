"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const index_1 = __importDefault(require("./routes/index"));
// 📘 Carrega variáveis de ambiente
dotenv_1.default.config();
// 🧩 Inicializa o app Express
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// 🌐 Rotas principais da API
app.use("/api", index_1.default);
// 🔧 Configurações
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "";
// 🧠 Função principal de inicialização
async function startServer() {
    try {
        if (!MONGO_URI) {
            throw new Error("❌ Variável MONGO_URI ausente no arquivo .env");
        }
        console.log("🔌 Conectando ao MongoDB...");
        await mongoose_1.default.connect(MONGO_URI);
        console.log("✅ Conectado ao MongoDB com sucesso!");
        // 🚀 Inicializa o servidor
        app.listen(PORT, () => {
            console.log(`🌍  KissaPagamentos v1.0 rodando na porta ${PORT}`);
            console.log(`📡  Endpoint base: http://localhost:${PORT}/api`);
        });
        // ⏰ Carrega agendador de conciliação diária (T+1 Proof of Settlement)
        Promise.resolve().then(() => __importStar(require("./scripts/dailyProofCron"))).then(() => console.log("⏱️  Agendador diário carregado com sucesso."))
            .catch((err) => console.error("⚠️  Erro ao carregar agendador diário:", err));
        // 🧾 (Opcional) Swagger — documentação automática
        // import { setupSwagger } from "./swagger";
        // setupSwagger(app);
        // console.log("📘 Documentação Swagger disponível em /docs");
    }
    catch (error) {
        console.error("💥 Erro crítico na inicialização:", error.message || error);
        process.exit(1);
    }
}
// ▶️ Execução
startServer();
