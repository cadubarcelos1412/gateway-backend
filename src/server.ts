import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import router from "./routes/index";

// ✅ Carrega variáveis de ambiente
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🌐 Rotas principais
app.use("/api", router);

// 🔌 Configuração do servidor
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

(async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI não definida no .env");
    }

    console.log("🔌 Tentando conectar ao MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Conectado ao MongoDB com sucesso.");

    // 🚀 Inicializa o servidor
    app.listen(PORT, () => {
      console.log(`🌍 Servidor rodando na porta ${PORT}`);
    });

    // 🕒 Importa e inicia o agendador diário (Proof of Settlement)
    // ⚠️ Faz o import dentro do escopo conectado, evitando crash se o banco falhar
    import("./scripts/dailyProofCron")
      .then(() => console.log("⏰ Agendador diário carregado com sucesso."))
      .catch((err) => console.error("❌ Erro ao carregar agendador diário:", err));
  } catch (err) {
    console.error("❌ Erro ao iniciar servidor:", err);
    process.exit(1);
  }
})();
