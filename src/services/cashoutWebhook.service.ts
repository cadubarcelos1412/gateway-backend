import mongoose, { Types } from "mongoose";
import CashoutRequest from "../models/cashoutRequest.model";
import { postLedgerEntries } from "./ledger/ledger.service";
import { TransactionAuditService } from "./transactionAudit.service";
import { round } from "../utils/fees";

export class CashoutWebhookService {
  static async processBankWebhook(event: any) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { cashoutId, amount, bankRef } = event;

      const cashout = await CashoutRequest.findById(cashoutId).session(session);
      if (!cashout) throw new Error("Solicitação de saque não encontrada.");
      if (cashout.status !== "approved")
        throw new Error("Cashout não está aprovado para liquidação.");

      const value = round(amount);

      // 🧾 Ledger — Confirmação da liquidação Pix/TED
      await postLedgerEntries(
        [
          { account: "conta_corrente_bancaria", type: "debit", amount: value },
          { account: "liquidação_pix", type: "credit", amount: value },
        ],
        {
          idempotencyKey: `cashout_confirmed:${cashoutId}`,
          transactionId: (cashout._id as Types.ObjectId).toString(), // ✅ corrigido
          sellerId: cashout.userId.toString(),
          source: { system: "bank_webhook", ip: event?.ip || "bank" },
          eventAt: new Date(),
        }
      );

      // ✅ Atualiza o status do cashout
      cashout.status = "completed";
      cashout.updatedAt = new Date();
      await cashout.save({ session });

      // 🧠 Auditoria contábil
      await TransactionAuditService.log({
        transactionId: cashout._id as Types.ObjectId,
        sellerId: cashout.userId as Types.ObjectId,
        userId: cashout.userId as Types.ObjectId,
        amount: value,
        method: "pix",
        status: "approved",
        kycStatus: "verified",
        flags: [],
        description: `Liquidação Pix confirmada pelo banco (${bankRef || "sem ref."})`,
      });

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}
