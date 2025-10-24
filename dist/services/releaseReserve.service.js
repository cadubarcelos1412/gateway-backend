"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleaseReserveService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const wallet_model_1 = require("../models/wallet.model");
const ledger_service_1 = require("./ledger/ledger.service");
const transactionAudit_service_1 = require("./transactionAudit.service");
const ledger_accounts_1 = require("../config/ledger-accounts");
const fees_1 = require("../utils/fees");
/**
 * 💰 ReleaseReserveService
 * Libera valores retidos em `reserva_risco` após período de segurança.
 * - Cria lançamentos contábeis de reversão (débit/credit)
 * - Atualiza o saldo disponível do seller
 * - Registra auditoria e hash de ledger
 */
class ReleaseReserveService {
    /**
     * 🔓 Libera manualmente ou automaticamente a reserva de risco.
     * @param sellerId ID do seller (Types.ObjectId)
     * @param amount Valor a liberar
     * @param reason Motivo da liberação
     */
    static async releaseReserve(sellerId, amount, reason = "Liberação automática de reserva técnica", session) {
        if (amount <= 0)
            throw new Error("Valor de liberação inválido.");
        const wallet = await wallet_model_1.Wallet.findOne({ userId: sellerId });
        if (!wallet)
            throw new Error("Carteira não encontrada.");
        // 🧮 Arredonda valor
        const value = (0, fees_1.round)(amount);
        // 🔒 Cria transação Mongo
        const internalSession = session || (await mongoose_1.default.startSession());
        let startedSession = false;
        if (!session) {
            internalSession.startTransaction();
            startedSession = true;
        }
        try {
            // 🧾 Lançamentos contábeis de liberação da reserva
            await (0, ledger_service_1.postLedgerEntries)([
                // Débito na conta de reserva_risco
                { account: ledger_accounts_1.LEDGER_ACCOUNTS.RESERVA_RISCO, type: "debit", amount: value },
                // Crédito no passivo_seller (valor liberado ao vendedor)
                { account: ledger_accounts_1.LEDGER_ACCOUNTS.PASSIVO_SELLER, type: "credit", amount: value },
            ], {
                idempotencyKey: `release:${sellerId}:${Date.now()}`,
                transactionId: new mongoose_1.default.Types.ObjectId().toString(),
                sellerId: sellerId.toString(),
                source: { system: "risk_reserve", acquirer: "internal" },
                eventAt: new Date(),
            });
            // 💼 Atualiza carteira
            wallet.balance.available += value;
            await wallet.save({ session: internalSession });
            // 🧠 Registra auditoria
            await transactionAudit_service_1.TransactionAuditService.log({
                transactionId: new mongoose_1.default.Types.ObjectId(),
                sellerId,
                userId: sellerId,
                amount: value,
                method: "pix",
                status: "approved",
                kycStatus: "verified",
                flags: [],
                description: reason,
            });
            if (startedSession) {
                await internalSession.commitTransaction();
                internalSession.endSession();
            }
            console.log(`✅ Reserva liberada: R$ ${value.toFixed(2)} para o seller ${sellerId}`);
            return { success: true, amount: value };
        }
        catch (err) {
            if (startedSession) {
                await internalSession.abortTransaction();
                internalSession.endSession();
            }
            console.error("❌ Erro ao liberar reserva:", err);
            throw err;
        }
    }
}
exports.ReleaseReserveService = ReleaseReserveService;
