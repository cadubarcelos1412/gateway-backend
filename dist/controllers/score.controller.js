"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransactionScore = exports.getSellerScore = void 0;
const transaction_model_1 = require("../models/transaction.model");
const seller_model_1 = require("../models/seller.model");
/**
 * 📊 Score de risco de um seller
 */
const getSellerScore = async (req, res) => {
    try {
        const { id } = req.params;
        const seller = await seller_model_1.Seller.findById(id);
        if (!seller) {
            res.status(404).json({ status: false, msg: "Seller não encontrado." });
            return;
        }
        const transactions = await transaction_model_1.Transaction.find({ sellerId: seller._id });
        const total = transactions.length;
        const highRisk = transactions.filter((t) => t.flags?.includes("HIGH_AMOUNT")).length;
        const foreignIp = transactions.filter((t) => t.flags?.includes("FOREIGN_IP")).length;
        const score = Math.max(0, 100 - (highRisk * 10 + foreignIp * 5));
        res.status(200).json({
            status: true,
            seller: {
                id: seller._id,
                name: seller.name,
                kycStatus: seller.kycStatus,
            },
            score,
            metrics: { total, highRisk, foreignIp },
        });
    }
    catch (error) {
        console.error("❌ Erro em getSellerScore:", error);
        res.status(500).json({ status: false, msg: "Erro ao calcular score do seller." });
    }
};
exports.getSellerScore = getSellerScore;
/**
 * 📈 Score de risco de uma transação
 */
const getTransactionScore = async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await transaction_model_1.Transaction.findById(id);
        if (!transaction) {
            res.status(404).json({ status: false, msg: "Transação não encontrada." });
            return;
        }
        const riskPoints = transaction.flags?.includes("HIGH_AMOUNT")
            ? 60
            : transaction.flags?.includes("FOREIGN_IP")
                ? 30
                : 10;
        const score = Math.max(0, 100 - riskPoints);
        res.status(200).json({
            status: true,
            transaction: {
                id: transaction._id,
                amount: transaction.amount,
                method: transaction.method,
                status: transaction.status,
            },
            score,
        });
    }
    catch (error) {
        console.error("❌ Erro em getTransactionScore:", error);
        res.status(500).json({ status: false, msg: "Erro ao calcular score da transação." });
    }
};
exports.getTransactionScore = getTransactionScore;
