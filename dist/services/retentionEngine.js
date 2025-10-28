"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetentionEngine = void 0;
// src/services/retentionEngine.ts
const retentionPolicy_model_1 = require("../models/retentionPolicy.model");
const fees_1 = require("../utils/fees");
/* -------------------------------------------------------------------------- */
/* 📊 RetentionEngine – Governança de retenção por política e risco           */
/* -------------------------------------------------------------------------- */
class RetentionEngine {
    /**
     * Calcula retenção financeira, percentual aplicado e data de liberação.
     * Baseia-se na política ativa e no nível de risco calculado.
     */
    static async calculate({ method, netAmount, riskLevel }) {
        const policy = await retentionPolicy_model_1.RetentionPolicy.findOne({
            method,
            riskLevel,
            active: true,
        }).lean();
        // 🧮 Percentual aplicado pela política
        const percentage = policy?.percentage || 0;
        const retentionAmount = (0, fees_1.round)(netAmount * (percentage / 100));
        // 📅 Dias de retenção com fallback seguro por método
        const fallbackDays = method === "pix" ? 0 : method === "boleto" ? 3 : 15;
        const days = policy?.days ?? fallbackDays;
        const availableIn = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        return {
            retentionAmount,
            percentage,
            availableIn,
            days,
            policyId: policy?._id || null,
            policyDescription: policy?.description || "Retenção padrão aplicada",
        };
    }
}
exports.RetentionEngine = RetentionEngine;
