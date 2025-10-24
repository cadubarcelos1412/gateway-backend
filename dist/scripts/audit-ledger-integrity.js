"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const ledgerIntegrity_service_1 = require("../services/ledger/ledgerIntegrity.service");
dotenv_1.default.config();
(async () => {
    console.log("🔍 Iniciando verificação de integridade do ledger...");
    try {
        await mongoose_1.default.connect(process.env.MONGO_URI);
        console.log("✅ Conectado ao banco de dados.\n");
        await ledgerIntegrity_service_1.LedgerIntegrityService.runIntegrityCheck();
    }
    catch (err) {
        console.error("❌ Erro na auditoria:", err);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("\n🔌 Conexão encerrada.");
    }
})();
