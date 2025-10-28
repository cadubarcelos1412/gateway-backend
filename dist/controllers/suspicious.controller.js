"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewSuspiciousTransaction = exports.getSuspiciousTransactions = void 0;
const transaction_model_1 = require("../models/transaction.model");
/**
 * 🚨 Lista transações suspeitas
 */
const getSuspiciousTransactions = async (_req, res) => {
    try {
        const suspicious = await transaction_model_1.Transaction.find({
            $or: [
                { flags: { $in: ["HIGH_AMOUNT", "FOREIGN_IP"] } },
                { status: "pending" },
            ],
        }).sort({ createdAt: -1 });
        res.status(200).json({
            status: true,
            count: suspicious.length,
            suspicious,
        });
    }
    catch (error) {
        console.error("❌ Erro em getSuspiciousTransactions:", error);
        res.status(500).json({ status: false, msg: "Erro ao buscar transações suspeitas." });
    }
};
exports.getSuspiciousTransactions = getSuspiciousTransactions;
/**
 * ✏️ Revisar (aprovar/bloquear) uma transação suspeita
 */
const reviewSuspiciousTransaction = async (req, res) => {
    try {
        const { id, action } = req.body;
        if (!id || !["approve", "block"].includes(action)) {
            res.status(400).json({
                status: false,
                msg: "Campos obrigatórios: id e action ('approve' ou 'block').",
            });
            return;
        }
        const tx = await transaction_model_1.Transaction.findById(id);
        if (!tx) {
            res.status(404).json({ status: false, msg: "Transação não encontrada." });
            return;
        }
        tx.status = action === "approve" ? "approved" : "failed";
        await tx.save();
        res.status(200).json({
            status: true,
            msg: `Transação ${action === "approve" ? "aprovada" : "bloqueada"} com sucesso.`,
        });
    }
    catch (error) {
        console.error("❌ Erro em reviewSuspiciousTransaction:", error);
        res.status(500).json({ status: false, msg: "Erro ao revisar transação suspeita." });
    }
};
exports.reviewSuspiciousTransaction = reviewSuspiciousTransaction;
