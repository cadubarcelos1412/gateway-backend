import mongoose from "mongoose";
import dotenv from "dotenv";
import { LedgerIntegrityService } from "../services/ledger/ledgerIntegrity.service";
import { LedgerExportService } from "../services/ledger/ledgerExport.service";
import { ReconciliationService } from "../services/ledger/reconciliation.service";

dotenv.config();

(async () => {
  const today = new Date().toISOString().substring(0, 10);
  console.log(`\n🕓 Iniciando fechamento contábil noturno (${today})...\n`);

  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("✅ Conectado ao banco com sucesso.\n");

    // 1️⃣ Verifica integridade
    const integrity = await LedgerIntegrityService.runIntegrityCheck();

    // 2️⃣ Exporta snapshots do dia
    const exportResult = await LedgerExportService.exportSnapshots(today, "json");

    // 3️⃣ Conciliação simulada (opcional)
    const filePath = `exports/getpay-${today}.json`;
    if (exportResult?.filePath && require("fs").existsSync(filePath)) {
      await ReconciliationService.reconcileExternalFile(filePath, today);
    } else {
      console.log("⚠️ Nenhum extrato externo encontrado. Pulando conciliação.\n");
    }

    console.log("\n✅ Fechamento contábil diário concluído com sucesso!");
  } catch (err) {
    console.error("❌ Erro no fechamento contábil:", err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Conexão encerrada.\n");
  }
})();
