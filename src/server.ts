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

// ⚙️ Carrega o Swagger (apenas se o arquivo existir)
let swaggerFile: any = null;
const swaggerPath = path.resolve(__dirname, "../swagger-output.json");

if (fs.existsSync(swaggerPath)) {
  swaggerFile = require(swaggerPath);
  console.log("📘 Swagger carregado com sucesso.");
} else {
  console.warn("⚠️  Swagger não encontrado — ignorando documentação.");
}

// 🧩 Inicializa o app Express
const app: Application = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔧 Configurações
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "";

// 🏠 Rota raiz
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    message: "🚀 API do Gateway rodando com sucesso!",
    version: "2.0.0",
    endpoints: {
      docs: "/docs",
      health: "/health",
      payments: "/api/payments",
      webhooks: "/api/webhooks",
      api: "/api"
    }
  });
});

// 🏥 Health check
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// 📘 Documentação Swagger (somente se disponível)
if (swaggerFile) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));
}

// 🌐 Rotas principais da API
app.use("/api", router);

// 🚨 Error handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error("❌ Erro não tratado:", err);
  res.status(500).json({
    success: false,
    message: "Erro interno do servidor",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// 🧠 Função principal de inicialização
async function startServer(): Promise<void> {
  try {
    if (!MONGO_URI) throw new Error("❌ Variável MONGO_URI ausente no arquivo .env");

    console.log("🔌 Conectando ao MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado ao MongoDB com sucesso!");

    // 🚀 Inicializa o servidor
    app.listen(PORT, () => {
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      
      console.log('╔════════════════════════════════════════════════╗');
      console.log('║  🚀 KissaPagamentos Gateway v2.0              ║');
      console.log('║                                                ║');
      console.log(`║  🌐 URL: ${baseUrl.padEnd(38)} ║`);
      console.log(`║  📘 Docs: ${(baseUrl + '/docs').padEnd(35)} ║`);
      console.log(`║  🏥 Health: ${(baseUrl + '/health').padEnd(33)} ║`);
      console.log(`║  🔧 Ambiente: ${(process.env.NODE_ENV || 'development').padEnd(31)} ║`);
      console.log('║                                                ║');
      console.log('╚════════════════════════════════════════════════╝');
    });

    // ⏰ Agendador diário (Proof of Settlement T+1)
    import("./scripts/dailyProofCron")
      .then(() => console.log("⏱️  Agendador diário carregado com sucesso."))
      .catch((err) => console.error("⚠️  Erro ao carregar agendador diário:", err));

  } catch (error: any) {
    console.error("💥 Erro crítico na inicialização:", error.message || error);
    process.exit(1);
  }
}

// ▶️ Execução
startServer();

export default app;
