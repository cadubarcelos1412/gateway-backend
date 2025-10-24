// src/server.ts
import express, { Application } from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import router from "./routes/index";

// 📘 Carrega variáveis de ambiente
dotenv.config();

// 🧩 Inicializa o app Express
const app: Application = express();
app.use(cors());
app.use(express.json());

// 🌐 Rotas principais da API
app.use("/api", router);

// 🔧 Configurações
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "";

// 🧠 Função principal de inicialização
async function startServer(): Promise<void> {
  try {
    if (!MONGO_URI) {
      throw new Error("❌ Variável MONGO_URI ausente no arquivo .env");
    }

    console.log("🔌 Conectando ao MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado ao MongoDB com sucesso!");

    // 🚀 Inicializa o servidor
    app.listen(PORT, () => {
      console.log(`🌍  KissaPagamentos v1.0 rodando na porta ${PORT}`);
      console.log(`📡  Endpoint base: http://localhost:${PORT}/api`);
    });

    // ⏰ Carrega agendador de conciliação diária (T+1 Proof of Settlement)
    import("./scripts/dailyProofCron")
      .then(() => console.log("⏱️  Agendador diário carregado com sucesso."))
      .catch((err) => console.error("⚠️  Erro ao carregar agendador diário:", err));

    // 🧾 (Opcional) Swagger — documentação automática
    // import { setupSwagger } from "./swagger";
    // setupSwagger(app);
    // console.log("📘 Documentação Swagger disponível em /docs");
  } catch (error: any) {
    console.error("💥 Erro crítico na inicialização:", error.message || error);
    process.exit(1);
  }
}

// ▶️ Execução
startServer();
