"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const retentionPolicy_model_1 = require("../models/retentionPolicy.model");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/gateway-db";
const seedRetentionPolicies = async () => {
    try {
        await mongoose_1.default.connect(MONGO_URI);
        console.log("✅ Conectado ao MongoDB");
        const basePolicies = [
            // 🟢 Sellers de baixo risco (empresas sólidas, KYC completo)
            { method: "pix", riskLevel: "low", percentage: 0, days: 0, description: "Saque imediato em D+0 para sellers verificados.", active: true },
            { method: "credit_card", riskLevel: "low", percentage: 5, days: 2, description: "Retenção mínima para liquidação de cartão.", active: true },
            { method: "boleto", riskLevel: "low", percentage: 5, days: 3, description: "Retenção padrão de boletos compensados.", active: true },
            // 🟡 Sellers médios (histórico limitado, ticket alto)
            { method: "pix", riskLevel: "medium", percentage: 10, days: 1, description: "Retenção moderada por risco operacional.", active: true },
            { method: "credit_card", riskLevel: "medium", percentage: 15, days: 7, description: "Maior retenção para histórico incompleto.", active: true },
            { method: "boleto", riskLevel: "medium", percentage: 15, days: 5, description: "Retenção estendida por risco de chargeback.", active: true },
            // 🔴 Sellers de alto risco (novos ou monitorados)
            { method: "pix", riskLevel: "high", percentage: 20, days: 3, description: "Retenção alta para mitigar fraudes em PIX.", active: true },
            { method: "credit_card", riskLevel: "high", percentage: 30, days: 15, description: "Liquidação estendida por risco elevado de estorno.", active: true },
            { method: "boleto", riskLevel: "high", percentage: 25, days: 10, description: "Retenção reforçada para boletos de alto risco.", active: true },
        ];
        await retentionPolicy_model_1.RetentionPolicy.deleteMany({});
        await retentionPolicy_model_1.RetentionPolicy.insertMany(basePolicies);
        console.log("✅ Políticas de retenção iniciais criadas com sucesso!");
        process.exit(0);
    }
    catch (err) {
        console.error("❌ Erro ao executar seeder:", err);
        process.exit(1);
    }
};
seedRetentionPolicies();
