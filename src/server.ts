// src/server.ts
import express, { Application, Request, Response } from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";
import router from "./routes/index";

/* -------------------------------------------------------------------------- */
/* 🌱 Carrega variáveis de ambiente de forma segura                            */
/* -------------------------------------------------------------------------- */
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

if (!process.env.MONGO_URI) {
  console.error("❌ ERRO: Variável MONGO_URI ausente no arquivo .env");
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* 🧩 Inicialização do app Express                                             */
/* -------------------------------------------------------------------------- */
const app: Application = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -------------------------------------------------------------------------- */
/* 🌐 CORS - Desenvolvimento e Produção                                       */
/* -------------------------------------------------------------------------- */
const allowedOrigins: string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://localhost:5000",
  "https://web-production-db663.up.railway.app",
  process.env.BASE_URL || "",
  process.env.FRONTEND_URL || ""
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Postman, mobile apps
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
        callback(null, true);
      } else {
        callback(new Error(`CORS bloqueado para origem: ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400,
  })
);
app.options("*", cors()); // preflight

/* -------------------------------------------------------------------------- */
/* ⚙️ Configurações principais                                                */
/* -------------------------------------------------------------------------- */
const ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL =
  process.env.BASE_URL ||
  (ENV === "production"
    ? "https://web-production-db663.up.railway.app"
    : `http://localhost:${PORT}`);
const MONGO_URI = process.env.MONGO_URI;

/* -------------------------------------------------------------------------- */
/* 📘 Swagger (opcional)                                                      */
/* -------------------------------------------------------------------------- */
const swaggerPath = path.resolve(__dirname, "../swagger-output.json");
if (fs.existsSync(swaggerPath)) {
  const swaggerFile = require(swaggerPath);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));
  console.log("📘 Swagger carregado com sucesso.");
} else {
  console.warn("⚠️ Swagger não encontrado — ignorando documentação.");
}

/* -------------------------------------------------------------------------- */
/* 🏠 Rota raiz e health check                                                */
/* -------------------------------------------------------------------------- */
app.get("/", (_req: Request, res: Response) => {
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

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
    environment: ENV,
    timestamp: new Date().toISOString(),
  });
});

/* -------------------------------------------------------------------------- */
/* 🌐 Rotas principais                                                        */
/* -------------------------------------------------------------------------- */
app.use("/api", router);

/* -------------------------------------------------------------------------- */
/* 🚨 Middleware global de erro                                               */
/* -------------------------------------------------------------------------- */
app.use((err: any, _req: Request, res: Response, _next: any) => {
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
async function startServer(): Promise<void> {
  try {
    console.log("🔌 Conectando ao MongoDB...");
    await mongoose.connect(MONGO_URI!);
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
      import("./scripts/dailyProofCron")
        .then(() => console.log("⏱️  Agendador diário (T+1) ativo."))
        .catch((err) => console.error("⚠️ Erro ao iniciar agendador:", err));
    } else {
      console.log("🧩 Ambiente local — agendador desativado.");
    }
  } catch (error: any) {
    console.error("💥 Erro crítico na inicialização:", error.message || error);
    process.exit(1);
  }
}

// ▶️ Executa servidor
startServer();

export default app;
