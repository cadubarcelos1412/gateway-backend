"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionAuditService = void 0;
const transactionAudit_model_1 = require("../models/transactionAudit.model");
class TransactionAuditService {
    /**
     * 🧾 Cria um registro de auditoria detalhado da transação
     * - Calcula automaticamente o riskScore com base no nível de risco
     * - Pode ser usada tanto em logs de falha quanto de sucesso
     */
    static async log(data) {
        const riskScore = data.riskScore ??
            (data.riskLevel === "high" ? 90 : data.riskLevel === "medium" ? 60 : 30);
        return await transactionAudit_model_1.TransactionAudit.create({
            transactionId: data.transactionId || null,
            sellerId: data.sellerId,
            userId: data.userId,
            amount: data.amount,
            method: data.method,
            status: data.status,
            description: data.description || "Auditoria registrada.",
            kycStatus: data.kycStatus,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            buyerDocument: data.buyerDocument,
            flags: data.flags,
            riskScore,
            retentionAmount: data.retentionAmount || 0,
            retentionDays: data.retentionDays || 0,
            createdAt: new Date(),
        });
    }
    /**
     * 📊 Busca tentativas anteriores associadas ao mesmo comprador ou IP
     * - Útil para análise de padrões de fraude e score dinâmico
     */
    static async getHistoricalAttempts(buyerDocument, ipAddress) {
        const query = {};
        if (buyerDocument)
            query.buyerDocument = buyerDocument;
        if (ipAddress)
            query.ipAddress = ipAddress;
        return await transactionAudit_model_1.TransactionAudit.find(query)
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
    }
}
exports.TransactionAuditService = TransactionAuditService;
