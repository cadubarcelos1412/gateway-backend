import mongoose from "mongoose";
import { Transaction } from "../models/transaction.model";
import { Seller } from "../models/seller.model";
import { reverseTransactionLedgerAndWallet } from "./ledger/reversal.service";
import { dispatchWebhookEvent } from "./webhook.service";
import { toPublicPayment } from "../utils/publicPayment";
import type { ZendryVerificationStatus } from "../lib/zendry/types";

interface ApplyResult {
  applied: boolean;
  newlyApproved: boolean;
  newlyFailed: boolean;
}

/**
 * Único ponto que aplica uma mudança de status vinda da Zendry numa
 * Transaction — usado tanto pelo webhook (zendryWebhook.controller.ts)
 * quanto pela reconciliação periódica (reconciliation.service.ts), pra não
 * duplicar a lógica de reversão de ledger/wallet em caso de falha.
 *
 * `status` já deve vir mapeado (ZendryVerificationStatus), não o status cru
 * da Zendry — quem chama usa mapZendryStatus() antes.
 */
export async function applyZendryPaymentStatus(externalId: string, status: ZendryVerificationStatus): Promise<ApplyResult> {
  const transaction = await Transaction.findOne({ externalId });
  if (!transaction) return { applied: false, newlyApproved: false, newlyFailed: false };

  let newlyApproved = false;
  let newlyFailed = false;

  if (status === "approved" && transaction.status !== "approved") {
    transaction.status = "approved";
    newlyApproved = true;
    await transaction.save();
  } else if ((status === "rejected" || status === "cancelled") && transaction.status === "pending") {
    newlyFailed = true;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      transaction.status = "failed";
      await transaction.save({ session });
      await reverseTransactionLedgerAndWallet(transaction, session, `status update: ${status}`);
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  if (newlyApproved || newlyFailed) {
    const seller = await Seller.findOne({ userId: transaction.userId });
    if (seller) {
      void dispatchWebhookEvent(
        String(seller._id),
        newlyApproved ? "payment.paid" : "payment.failed",
        toPublicPayment(transaction)
      );
    }
  }

  return { applied: newlyApproved || newlyFailed, newlyApproved, newlyFailed };
}
