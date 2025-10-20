import mongoose from "mongoose";
import dotenv from "dotenv";

// Carrega variáveis de ambiente do arquivo .env
dotenv.config();

// Pega a URI do MongoDB do .env ou usa fallback local apenas se necessário
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ ERRO: Variável MONGO_URI não encontrada no .env");
  process.exit(1);
}

export const connectDB = async (): Promise<void> => {
  try {
    console.log("🔌 Tentando conectar ao MongoDB...");
    console.log("🔎 URI usada:", MONGO_URI);

    await mongoose.connect(MONGO_URI);

    console.log("✅ Conectado ao MongoDB com sucesso!");
  } catch (error) {
    console.error("🚨 Erro ao conectar ao MongoDB:", error);
    process.exit(1);
  }
};
