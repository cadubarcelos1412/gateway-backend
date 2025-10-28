"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const ledgerSnapshot_model_1 = __importDefault(require("../models/ledger/ledgerSnapshot.model"));
dotenv_1.default.config();
(async () => {
    await mongoose_1.default.connect(process.env.MONGO_URI);
    console.log("✅ Conectado ao banco.");
    const dateKey = "2025-10-20"; // simula o dia anterior
    await ledgerSnapshot_model_1.default.deleteMany({ dateKey });
    await ledgerSnapshot_model_1.default.create([
        {
            dateKey,
            account: "conta_corrente_bancaria",
            balance: 3000,
            debitTotal: 1000,
            creditTotal: 4000,
            createdAt: new Date(),
        },
        {
            dateKey,
            account: "passivo_seller",
            balance: -3000,
            debitTotal: 4000,
            creditTotal: 1000,
            createdAt: new Date(),
        },
    ]);
    console.log("🧾 LedgerSnapshots criados com sucesso!");
    await mongoose_1.default.disconnect();
})();
