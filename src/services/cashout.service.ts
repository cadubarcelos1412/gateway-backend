import mongoose, { ClientSession, Types } from "mongoose";
import { Wallet } from "../models/wallet.model";
import CashoutRequest from "../models/cashoutRequest.model";
import { TransactionAuditService } from "./transactionAudit.service";
import { postLedgerEntries } from "./ledger/ledger.service";
import { round2 } from "./ledger/helpers";

/**
 * 💸 Serviço de Cashout (Liquidação)
 * - Controla todo fluxo de saque, aprovação e rejeição
 * - Gera lançamentos contábeis (dupla-entrada) e auditoria
 */
export class CashoutService {
  /**
   * 1️⃣ Criar solicitação de saque
   */
  static async createCashout(userId: Types.ObjectId, amount: number, session?: ClientSession) {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    if (wallet.balance.available < amount) throw new Error("Saldo insuficiente para saque.");

    // ❄️ Congela o valor solicitado
    wallet.balance.available -= amount;
    wallet.balance.unAvailable.push({
      amount,
      availableIn: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 dias
    });

    const [cashout] = await CashoutRequest.create(
      [{ userId, amount, status: "pending" }],
      { session }
    );

    await wallet.save({ session });

    await TransactionAuditService.log({
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
  static async approveCashout(
    cashoutId: Types.ObjectId,
    adminId: Types.ObjectId,
    session?: ClientSession
  ) {
    const cashout = await CashoutRequest.findById(cashoutId);
    if (!cashout) throw new Error("Solicitação não encontrada.");
    if (cashout.status !== "pending") throw new Error("Solicitação já processada.");

    const wallet = await Wallet.findOne({ userId: cashout.userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    const amount = round2(cashout.amount);

    // 🧾 Lançamentos contábeis — duplo-entry
    await postLedgerEntries(
      [
        { account: "passivo_seller", type: "debit", amount },
        { account: "conta_corrente_bancaria", type: "credit", amount },
      ],
      {
        idempotencyKey: `cashout:${(cashout._id as Types.ObjectId).toString()}`,
        transactionId: (cashout._id as Types.ObjectId).toString(),
        sellerId: cashout.userId.toString(),
        source: { system: "cashout", acquirer: "admin" },
        eventAt: new Date(),
      }
    );

    wallet.log.push({
      transactionId: new mongoose.Types.ObjectId(),
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

    await TransactionAuditService.log({
      transactionId: cashout._id as Types.ObjectId,
      sellerId: cashout.userId as Types.ObjectId,
      userId: cashout.userId as Types.ObjectId,
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
  static async rejectCashout(
    cashoutId: Types.ObjectId,
    adminId: Types.ObjectId,
    reason: string,
    session?: ClientSession
  ) {
    const cashout = await CashoutRequest.findById(cashoutId);
    if (!cashout) throw new Error("Solicitação não encontrada.");
    if (cashout.status !== "pending") throw new Error("Solicitação já processada.");

    const wallet = await Wallet.findOne({ userId: cashout.userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    wallet.balance.available += cashout.amount;

    wallet.log.push({
      transactionId: new mongoose.Types.ObjectId(),
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

    // ✅ trocado de "failed" para "rejected" — valor suportado por CashoutStatus
    cashout.status = "rejected";
    cashout.approvedBy = adminId;
    cashout.rejectionReason = reason;
    await cashout.save({ session });

    await TransactionAuditService.log({
      transactionId: cashout._id as Types.ObjectId,
      sellerId: cashout.userId as Types.ObjectId,
      userId: cashout.userId as Types.ObjectId,
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
