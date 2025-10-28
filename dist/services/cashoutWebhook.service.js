"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CashoutWebhookService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const cashoutRequest_model_1 = __importDefault(require("../models/cashoutRequest.model"));
const ledger_service_1 = require("./ledger/ledger.service");
const transactionAudit_service_1 = require("./transactionAudit.service");
const fees_1 = require("../utils/fees");
class CashoutWebhookService {
    static async processBankWebhook(event) {
        const session = await mongoose_1.default.startSession();
        session.startTransaction();
        try {
            const { cashoutId, amount, bankRef } = event;
            const cashout = await cashoutRequest_model_1.default.findById(cashoutId).session(session);
            if (!cashout)
                throw new Error("Solicitação de saque não encontrada.");
            if (cashout.status !== "approved")
                throw new Error("Cashout não está aprovado para liquidação.");
            const value = (0, fees_1.round)(amount);
            // 🧾 Ledger — Confirmação da liquidação Pix/TED
            await (0, ledger_service_1.postLedgerEntries)([
                { account: "conta_corrente_bancaria", type: "debit", amount: value },
                { account: "liquidação_pix", type: "credit", amount: value },
            ], {
                idempotencyKey: `cashout_confirmed:${cashoutId}`,
                transactionId: cashout._id.toString(), // ✅ corrigido
                sellerId: cashout.userId.toString(),
                source: { system: "bank_webhook", ip: event?.ip || "bank" },
                eventAt: new Date(),
            });
            // ✅ Atualiza o status do cashout
            cashout.status = "completed";
            cashout.updatedAt = new Date();
            await cashout.save({ session });
            // 🧠 Auditoria contábil
            await transactionAudit_service_1.TransactionAuditService.log({
                transactionId: cashout._id,
                sellerId: cashout.userId,
                userId: cashout.userId,
                amount: value,
                method: "pix",
                status: "approved",
                kycStatus: "verified",
                flags: [],
                description: `Liquidação Pix confirmada pelo banco (${bankRef || "sem ref."})`,
            });
            await session.commitTransaction();
        }
        catch (err) {
            await session.abortTransaction();
            throw err;
        }
        finally {
            session.endSession();
        }
    }
}
exports.CashoutWebhookService = CashoutWebhookService;
