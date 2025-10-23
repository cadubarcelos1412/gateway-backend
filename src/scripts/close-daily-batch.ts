// src/scripts/close-daily-batch.ts
import dotenv from "dotenv";
import mongoose from "mongoose";
import { LedgerBatchService } from "../services/ledger/ledgerBatch.service";

dotenv.config();

async function main() {
  console.log("🏁 Iniciando fechamento contábil diário...");

  if (!process.env.MONGO_URI) {
    console.error("❌ ERRO: MONGO_URI não definida no .env");
    process.exit(1);
  }

  try {
    // 🔌 Conexão com MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado ao banco com sucesso.");

    // 📅 Fecha o batch de hoje
    const today = new Date();
    await LedgerBatchService.closeDailyBatch(today);

    console.log("🎯 Fechamento diário executado com sucesso.");
  } catch (err) {
    console.error("❌ Erro no fechamento diário:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Conexão encerrada.");
    process.exit(0);
  }
}

main();
