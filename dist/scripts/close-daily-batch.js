"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/close-daily-batch.ts
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const ledgerBatch_service_1 = require("../services/ledger/ledgerBatch.service");
dotenv_1.default.config();
async function main() {
    console.log("🏁 Iniciando fechamento contábil diário...");
    if (!process.env.MONGO_URI) {
        console.error("❌ ERRO: MONGO_URI não definida no .env");
        process.exit(1);
    }
    try {
        // 🔌 Conexão com MongoDB
        await mongoose_1.default.connect(process.env.MONGO_URI);
        console.log("✅ Conectado ao banco com sucesso.");
        // 📅 Fecha o batch de hoje
        const today = new Date();
        await ledgerBatch_service_1.LedgerBatchService.closeDailyBatch(today);
        console.log("🎯 Fechamento diário executado com sucesso.");
    }
    catch (err) {
        console.error("❌ Erro no fechamento diário:", err);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("🔌 Conexão encerrada.");
        process.exit(0);
    }
}
main();
