"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FraudAnalysisService = void 0;
const transaction_model_1 = require("../models/transaction.model");
const riskEngine_1 = require("./riskEngine");
const transactionAudit_service_1 = require("./transactionAudit.service");
const seller_model_1 = require("../models/seller.model");
class FraudAnalysisService {
    static async analyzeTransaction(transactionId) {
        const tx = await transaction_model_1.Transaction.findById(transactionId);
        if (!tx)
            throw new Error("Transação não encontrada.");
        const seller = await seller_model_1.Seller.findById(tx.sellerId);
        if (!seller)
            throw new Error("Seller não encontrado.");
        const { flags, level } = riskEngine_1.RiskEngine.evaluate({
            amount: tx.amount,
            ip: tx.metadata?.ipAddress,
            seller,
        });
        // ✅ Mapeia status corretamente
        const auditStatus = tx.status === "refunded" ? "blocked" : tx.status;
        await transactionAudit_service_1.TransactionAuditService.log({
            transactionId: tx._id,
            sellerId: seller._id,
            userId: seller.userId,
            amount: tx.amount,
            method: tx.method,
            status: auditStatus,
            flags,
            kycStatus: seller.kycStatus,
            description: `Análise antifraude automática (${level})`,
        });
        return { transaction: tx, flags, level };
    }
    static async scanRecentTransactions() {
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const txs = await transaction_model_1.Transaction.find({ createdAt: { $gte: since } });
        const results = [];
        for (const tx of txs) {
            try {
                const txId = tx._id.toString();
                const result = await this.analyzeTransaction(txId);
                if (result.level !== "low")
                    results.push(result);
            }
            catch (err) {
                console.warn("⚠️ Falha ao analisar transação:", err);
            }
        }
        return results;
    }
}
exports.FraudAnalysisService = FraudAnalysisService;
