import mongoose, { Types, ClientSession } from "mongoose";
import { Wallet } from "../models/wallet.model";
import { postLedgerEntries } from "./ledger/ledger.service";
import { TransactionAuditService } from "./transactionAudit.service";
import { LEDGER_ACCOUNTS } from "../config/ledger-accounts";
import { round } from "../utils/fees";

/**
 * 💰 ReleaseReserveService
 * Libera valores retidos em `reserva_risco` após período de segurança.
 * - Cria lançamentos contábeis de reversão (débit/credit)
 * - Atualiza o saldo disponível do seller
 * - Registra auditoria e hash de ledger
 */
export class ReleaseReserveService {
  /**
   * 🔓 Libera manualmente ou automaticamente a reserva de risco.
   * @param sellerId ID do seller (Types.ObjectId)
   * @param amount Valor a liberar
   * @param reason Motivo da liberação
   */
  static async releaseReserve(
    sellerId: Types.ObjectId,
    amount: number,
    reason = "Liberação automática de reserva técnica",
    session?: ClientSession
  ) {
    if (amount <= 0) throw new Error("Valor de liberação inválido.");

    const wallet = await Wallet.findOne({ userId: sellerId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    // 🧮 Arredonda valor
    const value = round(amount);

    // 🔒 Cria transação Mongo
    const internalSession = session || (await mongoose.startSession());
    let startedSession = false;
    if (!session) {
      internalSession.startTransaction();
      startedSession = true;
    }

    try {
      // 🧾 Lançamentos contábeis de liberação da reserva
      await postLedgerEntries(
        [
          // Débito na conta de reserva_risco
          { account: LEDGER_ACCOUNTS.RESERVA_RISCO, type: "debit", amount: value },
          // Crédito no passivo_seller (valor liberado ao vendedor)
          { account: LEDGER_ACCOUNTS.PASSIVO_SELLER, type: "credit", amount: value },
        ],
        {
          idempotencyKey: `release:${sellerId}:${Date.now()}`,
          transactionId: new mongoose.Types.ObjectId().toString(),
          sellerId: sellerId.toString(),
          source: { system: "risk_reserve", acquirer: "internal" },
          eventAt: new Date(),
        }
      );

      // 💼 Atualiza carteira
      wallet.balance.available += value;
      await wallet.save({ session: internalSession });

      // 🧠 Registra auditoria
      await TransactionAuditService.log({
        transactionId: new mongoose.Types.ObjectId(),
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
    } catch (err) {
      if (startedSession) {
        await internalSession.abortTransaction();
        internalSession.endSession();
      }
      console.error("❌ Erro ao liberar reserva:", err);
      throw err;
    }
  }
}
