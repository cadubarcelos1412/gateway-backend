"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const ledgerIntegrity_service_1 = require("../services/ledger/ledgerIntegrity.service");
const ledgerExport_service_1 = require("../services/ledger/ledgerExport.service");
const reconciliation_service_1 = require("../services/ledger/reconciliation.service");
dotenv_1.default.config();
(async () => {
    const today = new Date().toISOString().substring(0, 10);
    console.log(`\n🕓 Iniciando fechamento contábil noturno (${today})...\n`);
    try {
        await mongoose_1.default.connect(process.env.MONGO_URI);
        console.log("✅ Conectado ao banco com sucesso.\n");
        // 1️⃣ Verifica integridade
        const integrity = await ledgerIntegrity_service_1.LedgerIntegrityService.runIntegrityCheck();
        // 2️⃣ Exporta snapshots do dia
        const exportResult = await ledgerExport_service_1.LedgerExportService.exportSnapshots(today, "json");
        // 3️⃣ Conciliação simulada (opcional)
        const filePath = `exports/getpay-${today}.json`;
        if (exportResult?.filePath && require("fs").existsSync(filePath)) {
            await reconciliation_service_1.ReconciliationService.reconcileExternalFile(filePath, today);
        }
        else {
            console.log("⚠️ Nenhum extrato externo encontrado. Pulando conciliação.\n");
        }
        console.log("\n✅ Fechamento contábil diário concluído com sucesso!");
    }
    catch (err) {
        console.error("❌ Erro no fechamento contábil:", err);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("🔌 Conexão encerrada.\n");
    }
})();
