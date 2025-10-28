// src/server.ts
import express, { Application, Request, Response } from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import router from "./routes/index";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import path from "path";

// 📘 Carrega variáveis de ambiente
dotenv.config();

// 🧩 Inicializa o app Express
const app: Application = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* -------------------------------------------------------------------------- */
/* 🌐 CORS - LIBERADO PARA DESENVOLVIMENTO E PRODUÇÃO                        */
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
      // Permite requisições sem origin (Postman, mobile apps, etc)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400 // 24 horas
  })
);

// Preflight requests
app.options('*', cors());

/* -------------------------------------------------------------------------- */
/* ⚙️ Variáveis principais                                                    */
/* -------------------------------------------------------------------------- */
const ENV = process.env.NODE_ENV || "development";
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL: string =
  process.env.BASE_URL ||
  (ENV === "production"
    ? "https://web-production-db663.up.railway.app"
    : `http://localhost:${PORT}`);
const MONGO_URI = process.env.MONGO_URI || "";

/* -------------------------------------------------------------------------- */
/* 📘 Carrega Swagger se disponível                                           */
/* -------------------------------------------------------------------------- */
let swaggerFile: any = null;
const swaggerPath = path.resolve(__dirname, "../swagger-output.json");
if (fs.existsSync(swaggerPath)) {
  swaggerFile = require(swaggerPath);
  console.log("📘 Swagger carregado com sucesso.");
} else {
  console.warn("⚠️ Swagger não encontrado — ignorando documentação.");
}

/* -------------------------------------------------------------------------- */
/* 🏠 Rota raiz                                                               */
/* -------------------------------------------------------------------------- */
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    message: "🚀 API do Gateway rodando com sucesso!",
    version: "2.0.0",
    environment: ENV,
    endpoints: {
      docs: "/docs",
      health: "/health",
      payments: "/api/payments",
      webhooks: "/api/webhooks",
      api: "/api",
    },
  });
});

/* -------------------------------------------------------------------------- */
/* 🏥 Health Check                                                            */
/* -------------------------------------------------------------------------- */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: ENV,
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

/* -------------------------------------------------------------------------- */
/* 📘 Swagger Docs                                                            */
/* -------------------------------------------------------------------------- */
if (swaggerFile) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));
}

/* -------------------------------------------------------------------------- */
/* 🌐 Rotas principais                                                        */
/* -------------------------------------------------------------------------- */
app.use("/api", router);

/* -------------------------------------------------------------------------- */
/* 🚨 Error Handler global                                                    */
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
    if (!MONGO_URI)
      throw new Error("❌ Variável MONGO_URI ausente no arquivo .env");

    console.log("🔌 Conectando ao MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado ao MongoDB com sucesso!");

    // 🚀 Inicializa servidor
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════╗
║  🚀 KissaPagamentos Gateway v2.0              ║
║                                                ║
║  🌐 URL: ${BASE_URL.padEnd(38, " ")}║
║  📘 Docs: ${(BASE_URL + "/docs").padEnd(35, " ")}║
║  🏥 Health: ${(BASE_URL + "/health").padEnd(33, " ")}║
║  🔧 Ambiente: ${ENV.padEnd(32, " ")}║
║                                                ║
╚════════════════════════════════════════════════╝
      `);
    });

    // ⏰ Agendador T+1
    if (ENV === "production") {
      import("./scripts/dailyProofCron")
        .then(() => console.log("⏱️  Agendador diário (T+1) ativo."))
        .catch((err) =>
          console.error("⚠️  Erro ao carregar agendador diário:", err)
        );
    } else {
      console.log("🧩 Ambiente local detectado — agendador desativado.");
    }
  } catch (error: any) {
    console.error("💥 Erro crítico na inicialização:", error.message || error);
    process.exit(1);
  }
}

// ▶️ Execução
startServer();

export default app;