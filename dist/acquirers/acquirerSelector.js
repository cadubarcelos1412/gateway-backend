"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectAcquirer = selectAcquirer;
// src/acquirers/acquirerSelector.ts
const seller_model_1 = require("../models/seller.model");
/**
 * 🧩 Seleciona dinamicamente a adquirente do seller.
 * - Lê do campo Seller.financialConfig.acquirer
 * - Se não existir, usa "pagarme" como padrão
 */
async function selectAcquirer(sellerId) {
    try {
        if (!sellerId)
            return "pagarme";
        const seller = await seller_model_1.Seller.findById(sellerId)
            .select("financialConfig.acquirer")
            .lean();
        const acquirer = seller?.financialConfig?.acquirer || "pagarme";
        return acquirer;
    }
    catch (error) {
        console.error("❌ Erro ao selecionar adquirente:", error);
        return "pagarme";
    }
}
