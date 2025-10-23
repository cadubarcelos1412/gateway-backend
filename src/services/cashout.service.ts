import mongoose, { ClientSession, Types } from "mongoose";
import { Wallet } from "../models/wallet.model";
import CashoutRequest from "../models/cashoutRequest.model";
import LedgerSnapshotModel from "../models/ledger/ledgerSnapshot.model";
import { TransactionAuditService } from "./transactionAudit.service";
import { postLedgerEntries } from "./ledger/ledger.service";
import { round2 } from "./ledger/helpers";

export class CashoutService {
  static async createCashout(userId: Types.ObjectId, amount: number, session?: ClientSession) {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new Error("Carteira não encontrada.");

    if (wallet.balance.available < amount) throw new Error("Saldo insuficiente para saque.");

    // 🚫 Validação de lock contábil
    const latestSnapshot = await LedgerSnapshotModel.findOne().sort({ createdAt: -1 });
    if (latestSnapshot?.locked) {
      throw new Error(
        "Bloqueio contábil ativo: divergência detectada no último fechamento. Cashouts suspensos."
      );
    }

    wallet.balance.available -= amount;
    wallet.balance.unAvailable.push({
      amount,
      availableIn: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
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

  // ... resto do serviço (approve/reject) continua igual
}
