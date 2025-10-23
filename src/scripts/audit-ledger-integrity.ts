import mongoose from "mongoose";
import dotenv from "dotenv";
import { LedgerIntegrityService } from "../services/ledger/ledgerIntegrity.service";

dotenv.config();

(async () => {
  console.log("🔍 Iniciando verificação de integridade do ledger...");
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("✅ Conectado ao banco de dados.\n");

    await LedgerIntegrityService.runIntegrityCheck();
  } catch (err) {
    console.error("❌ Erro na auditoria:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Conexão encerrada.");
  }
})();
