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
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_1 = __importDefault(require("./routes/index"));
/* -------------------------------------------------------------------------- */
/* 🌱 Carrega variáveis de ambiente de forma segura                            */
/* -------------------------------------------------------------------------- */
const envPath = path_1.default.resolve(__dirname, "../.env");
dotenv_1.default.config({ path: envPath });
if (!process.env.MONGO_URI) {
    console.error("❌ ERRO: Variável MONGO_URI ausente no arquivo .env");
    process.exit(1);
}
/* -------------------------------------------------------------------------- */
/* 🧩 Inicialização do app Express                                             */
/* -------------------------------------------------------------------------- */
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
/* -------------------------------------------------------------------------- */
/* 🌐 CORS - Desenvolvimento e Produção                                       */
/* -------------------------------------------------------------------------- */
const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:5000",
    "https://web-production-db663.up.railway.app",
    process.env.BASE_URL || "",
    process.env.FRONTEND_URL || ""
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true); // Postman, mobile apps
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
            callback(null, true);
        }
        else {
            callback(new Error(`CORS bloqueado para origem: ${origin}`));
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400,
}));
app.options("*", (0, cors_1.default)()); // preflight
/* -------------------------------------------------------------------------- */
/* ⚙️ Configurações principais                                                */
/* -------------------------------------------------------------------------- */
const ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL ||
    (ENV === "production"
        ? "https://web-production-db663.up.railway.app"
        : `http://localhost:${PORT}`);
const MONGO_URI = process.env.MONGO_URI;
/* -------------------------------------------------------------------------- */
/* 📘 Swagger (opcional)                                                      */
/* -------------------------------------------------------------------------- */
const swaggerPath = path_1.default.resolve(__dirname, "../swagger-output.json");
if (fs_1.default.existsSync(swaggerPath)) {
    const swaggerFile = require(swaggerPath);
    app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerFile));
    console.log("📘 Swagger carregado com sucesso.");
}
else {
    console.warn("⚠️ Swagger não encontrado — ignorando documentação.");
}
/* -------------------------------------------------------------------------- */
/* 🏠 Rota raiz e health check                                                */
/* -------------------------------------------------------------------------- */
app.get("/", (_req, res) => {
    res.status(200).json({
        message: "🚀 API do Gateway rodando com sucesso!",
        version: "2.0.0",
        environment: ENV,
        endpoints: {
            docs: "/docs",
            health: "/health",
            api: "/api",
        },
    });
});
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "healthy",
        mongodb: mongoose_1.default.connection.readyState === 1 ? "connected" : "disconnected",
        uptime: process.uptime(),
        environment: ENV,
        timestamp: new Date().toISOString(),
    });
});
/* -------------------------------------------------------------------------- */
/* 🌐 Rotas principais                                                        */
/* -------------------------------------------------------------------------- */
app.use("/api", index_1.default);
/* -------------------------------------------------------------------------- */
/* 🚨 Middleware global de erro                                               */
/* -------------------------------------------------------------------------- */
app.use((err, _req, res, _next) => {
    console.error("❌ Erro não tratado:", err);
    res.status(500).json({
        success: false,
        message: "Erro interno do servidor",
        error: ENV === "development" ? err.message : undefined,
    });
});
/* -------------------------------------------------------------------------- */
/* 🧠 Inicialização do servidor                                               */
/* -------------------------------------------------------------------------- */
async function startServer() {
    try {
        console.log("🔌 Conectando ao MongoDB...");
        await mongoose_1.default.connect(MONGO_URI);
        console.log("✅ Conectado ao MongoDB com sucesso!");
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════╗
║ 🚀 KissaPagamentos Gateway v2.0               ║
║                                                ║
║ 🌐 URL: ${BASE_URL.padEnd(38, " ")}║
║ 📘 Docs: ${(BASE_URL + "/docs").padEnd(35, " ")}║
║ 🏥 Health: ${(BASE_URL + "/health").padEnd(33, " ")}║
║ 🔧 Ambiente: ${ENV.padEnd(32, " ")}║
╚════════════════════════════════════════════════╝
      `);
        });
        // ⏰ Agendador T+1 (desativado localmente)
        if (ENV === "production") {
            Promise.resolve().then(() => __importStar(require("./scripts/dailyProofCron"))).then(() => console.log("⏱️  Agendador diário (T+1) ativo."))
                .catch((err) => console.error("⚠️ Erro ao iniciar agendador:", err));
        }
        else {
            console.log("🧩 Ambiente local — agendador desativado.");
        }
    }
    catch (error) {
        console.error("💥 Erro crítico na inicialização:", error.message || error);
        process.exit(1);
    }
}
// ▶️ Executa servidor
startServer();
exports.default = app;
