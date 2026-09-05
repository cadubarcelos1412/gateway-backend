// src/services/paymentReversal.service.ts
//
// Reembolso e chargeback MANUAIS — mesmo padrão já aprovado pro Wire
// internacional (ver wireCashout.service.ts): nem Zendry nem Sttart têm
// endpoint de estorno/cancelamento confirmado no código (ver nota em
// lib/zendry/card.ts), então a PyxGate nunca chama a adquirente aqui. Quem
// devolve o dinheiro de verdade é o master, manualmente, fora do sistema —
// esta função só registra a decisão, reverte o PRÓPRIO ledger/wallet, e
// dispara o webhook pro seller saber.
//
// Reaproveita reverseTransactionLedgerAndWallet (ledger/reversal.service.ts)
// sem modificá-la — ela já é idempotente (reversedAt) e já lança erro claro
// se o saldo já foi sacado, em vez de deixar a wallet negativa.
import mongoose, { Types } from "mongoose";
import { Transaction, ITransaction } from "../models/transaction.model";
import { Seller } from "../models/seller.model";
import { reverseTransactionLedgerAndWallet } from "./ledger/reversal.service";
import { dispatchWebhookEvent } from "./webhook.service";
import { toPublicPayment } from "../utils/publicPayment";

async function loadApprovedTransaction(transactionId: string): Promise<ITransaction> {
  if (!Types.ObjectId.isValid(transactionId)) {
    throw new Error("ID de transação inválido.");
  }
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) {
    throw new Error("Transação não encontrada.");
  }
  if (transaction.status !== "approved") {
    throw new Error(
      `Só é possível registrar isso numa transação aprovada (status atual: "${transaction.status}").`
    );
  }
  return transaction;
}

async function notifySeller(transaction: ITransaction, eventType: string): Promise<void> {
  const seller = await Seller.findOne({ userId: transaction.userId });
  if (seller) {
    void dispatchWebhookEvent(String(seller._id), eventType, toPublicPayment(transaction));
  }
}

/**
 * Registra reembolso — dinheiro devolvido ao comprador. Reverte o crédito
 * do seller (ledger + wallet) e marca a transação como "refunded".
 */
export async function recordManualRefund(
  transactionId: string,
  recordedByUserId: string,
  reason: string
): Promise<ITransaction> {
  if (!reason?.trim()) throw new Error("Motivo do reembolso é obrigatório.");
  const transaction = await loadApprovedTransaction(transactionId);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    transaction.status = "refunded";
    transaction.refundedAt = new Date();
    transaction.refundReason = reason;
    transaction.refundedBy = new Types.ObjectId(recordedByUserId);
    await transaction.save({ session });

    await reverseTransactionLedgerAndWallet(transaction, session, `reembolso manual: ${reason}`);
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await notifySeller(transaction, "payment.refunded");
  return transaction;
}

/**
 * Registra chargeback — contestação do comprador junto ao banco/emissor
 * (a PyxGate não inicia isso, só reflete que aconteceu). Mesma reversão de
 * reembolso, status final diferente.
 */
export async function recordChargeback(
  transactionId: string,
  recordedByUserId: string,
  reason: string
): Promise<ITransaction> {
  if (!reason?.trim()) throw new Error("Motivo do chargeback é obrigatório.");
  const transaction = await loadApprovedTransaction(transactionId);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    transaction.status = "chargedback";
    transaction.chargedbackAt = new Date();
    transaction.chargebackReason = reason;
    transaction.chargedbackBy = new Types.ObjectId(recordedByUserId);
    await transaction.save({ session });

    await reverseTransactionLedgerAndWallet(transaction, session, `chargeback: ${reason}`);
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await notifySeller(transaction, "payment.chargedback");
  return transaction;
}

/**
 * Registra cancelamento PARCIAL — só informativo (dispara webhook), NÃO
 * mexe em ledger/wallet. Reversão proporcional de valor parcial é uma
 * matemática de ledger mais delicada (rateio de fee/split); fica pra uma
 * iteração futura se algum dia for necessária de verdade (ver plano de
 * webhooks, 2026-09-05). Não exige a transação estar "approved" porque é
 * só um registro — pode ser anotado em qualquer status.
 */
export async function recordPartialCancellation(
  transactionId: string,
  amount: number,
  recordedByUserId: string,
  reason: string
): Promise<ITransaction> {
  if (!reason?.trim()) throw new Error("Motivo do cancelamento parcial é obrigatório.");
  if (!(amount > 0)) throw new Error("Valor do cancelamento parcial deve ser maior que zero.");
  if (!Types.ObjectId.isValid(transactionId)) throw new Error("ID de transação inválido.");

  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw new Error("Transação não encontrada.");

  transaction.partialCancellations = transaction.partialCancellations || [];
  transaction.partialCancellations.push({
    amount,
    reason,
    recordedBy: new Types.ObjectId(recordedByUserId),
    recordedAt: new Date(),
  });
  await transaction.save();

  await notifySeller(transaction, "payment.partially_canceled");
  return transaction;
}
