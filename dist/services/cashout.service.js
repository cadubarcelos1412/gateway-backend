"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashoutService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const wallet_model_1 = require("../models/wallet.model");
const cashoutRequest_model_1 = __importDefault(require("../models/cashoutRequest.model"));
const transactionAudit_service_1 = require("./transactionAudit.service");
const ledger_service_1 = require("./ledger/ledger.service");
const fees_1 = require("../utils/fees");
/**
 * 💸 Serviço de Cashout (Liquidação)
 * - Controla todo fluxo de saque, aprovação e rejeição
 * - Gera lançamentos contábeis (dupla-entrada) e auditoria
 */
class CashoutService {
    /**
     * 1️⃣ Criar solicitação de saque
     */
    static async createCashout(userId, amount, session) {
        const wallet = await wallet_model_1.Wallet.findOne({ userId });
        if (!wallet)
            throw new Error("Carteira não encontrada.");
        if (wallet.balance.available < amount)
            throw new Error("Saldo insuficiente para saque.");
        wallet.balance.available -= amount;
        wallet.balance.unAvailable.push({
            amount,
            availableIn: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        });
        const [cashout] = await cashoutRequest_model_1.default.create([{ userId, amount, status: "pending" }], { session });
        await wallet.save({ session });
        await transactionAudit_service_1.TransactionAuditService.log({
            transactionId: null,
            sellerId: userId,
            userId,
            amount,
            method: "pix",
            status: "pending",
            kycStatus: "verified",
            flags: [],
            description: "Solicitação de saque criada.",
        });
        return cashout;
    }
    /**
     * 2️⃣ Aprovar solicitação de saque
     */
    static async approveCashout(cashoutId, adminId, session) {
        const cashout = await cashoutRequest_model_1.default.findById(cashoutId);
        if (!cashout)
            throw new Error("Solicitação não encontrada.");
        if (cashout.status !== "pending")
            throw new Error("Solicitação já processada.");
        const wallet = await wallet_model_1.Wallet.findOne({ userId: cashout.userId });
        if (!wallet)
            throw new Error("Carteira não encontrada.");
        const amount = (0, fees_1.round)(cashout.amount);
        const cashoutIdStr = cashout._id.toString();
        // 🧾 Lançamentos contábeis — dupla entrada
        await (0, ledger_service_1.postLedgerEntries)([
            { account: "passivo_seller", type: "debit", amount },
            { account: "conta_corrente_bancaria", type: "credit", amount },
        ], {
            idempotencyKey: `cashout:${cashoutIdStr}`,
            transactionId: cashoutIdStr,
            sellerId: cashout.userId.toString(),
            source: { system: "cashout", acquirer: "admin" },
            eventAt: new Date(),
        });
        wallet.log.push({
            transactionId: new mongoose_1.default.Types.ObjectId(),
            type: "withdraw",
            method: "pix",
            amount,
            security: {
                createdAt: new Date(),
                ipAddress: "system",
                userAgent: "admin-dashboard",
            },
        });
        await wallet.save({ session });
        cashout.status = "approved";
        cashout.approvedBy = adminId;
        cashout.approvedAt = new Date();
        await cashout.save({ session });
        await transactionAudit_service_1.TransactionAuditService.log({
            transactionId: cashout._id,
            sellerId: cashout.userId,
            userId: cashout.userId,
            amount,
            method: "pix",
            status: "approved",
            kycStatus: "verified",
            flags: [],
            description: "Saque aprovado e liquidado no ledger.",
        });
        return { cashout, wallet };
    }
    /**
     * 3️⃣ Rejeitar solicitação de saque
     */
    static async rejectCashout(cashoutId, adminId, reason, session) {
        const cashout = await cashoutRequest_model_1.default.findById(cashoutId);
        if (!cashout)
            throw new Error("Solicitação não encontrada.");
        if (cashout.status !== "pending")
            throw new Error("Solicitação já processada.");
        const wallet = await wallet_model_1.Wallet.findOne({ userId: cashout.userId });
        if (!wallet)
            throw new Error("Carteira não encontrada.");
        wallet.balance.available += cashout.amount;
        wallet.log.push({
            transactionId: new mongoose_1.default.Types.ObjectId(),
            type: "topup",
            method: "pix",
            amount: cashout.amount,
            security: {
                createdAt: new Date(),
                ipAddress: "system",
                userAgent: "admin-dashboard",
            },
        });
        await wallet.save({ session });
        cashout.status = "rejected";
        cashout.approvedBy = adminId;
        cashout.rejectionReason = reason;
        await cashout.save({ session });
        await transactionAudit_service_1.TransactionAuditService.log({
            transactionId: cashout._id,
            sellerId: cashout.userId,
            userId: cashout.userId,
            amount: cashout.amount,
            method: "pix",
            status: "failed",
            kycStatus: "verified",
            flags: ["FAILED_ATTEMPT"],
            description: `Saque rejeitado: ${reason}`,
        });
        return { cashout, wallet };
    }
}
exports.CashoutService = CashoutService;
