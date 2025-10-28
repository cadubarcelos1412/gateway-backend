"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskScoreService = void 0;
const transaction_model_1 = require("../models/transaction.model");
const seller_model_1 = require("../models/seller.model");
/**
 * 📊 RiskScoreService
 * - Calcula pontuação de risco dinâmica (0–100)
 * - Baseia-se em histórico de transações e flags
 */
class RiskScoreService {
    static async calculateSellerScore(seller) {
        const txs = await transaction_model_1.Transaction.find({ sellerId: seller._id });
        if (txs.length === 0)
            return 100;
        const total = txs.length;
        const failed = txs.filter((t) => t.status === "failed").length;
        const highRisk = txs.filter((t) => t.flags?.includes("HIGH_AMOUNT")).length;
        const foreignIp = txs.filter((t) => t.flags?.includes("FOREIGN_IP")).length;
        const failureRate = failed / total;
        const riskWeight = (highRisk * 2 + foreignIp) / total;
        const score = Math.max(0, 100 - (failureRate * 40 + riskWeight * 60) * 100);
        return Math.round(score);
    }
    static async getTransactionScore(transactionId) {
        const tx = await transaction_model_1.Transaction.findById(transactionId);
        if (!tx)
            throw new Error("Transação não encontrada.");
        const seller = await seller_model_1.Seller.findById(tx.sellerId);
        if (!seller)
            throw new Error("Seller não encontrado.");
        const sellerScore = await this.calculateSellerScore(seller);
        let penalty = 0;
        if (tx.amount > 10000)
            penalty += 10;
        if (tx.flags?.includes("FOREIGN_IP"))
            penalty += 5;
        return Math.max(0, sellerScore - penalty);
    }
}
exports.RiskScoreService = RiskScoreService;
