import mongoose, { Types } from "mongoose";
import { Transaction, ITransaction } from "../models/transaction.model";
import { Seller } from "../models/seller.model";
import { resolveAcquirer } from "../acquirers";
import { reverseTransactionLedgerAndWallet } from "./ledger/reversal.service";
import { TransactionAuditService } from "./transactionAudit.service";
import { dispatchWebhookEvent } from "./webhook.service";
import { toPublicPayment } from "../utils/publicPayment";
import { TransactionMode } from "./transaction.service";

export class RefundError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface CreateRefundParams {
  transactionId: string;
  merchantUserId: Types.ObjectId;
  apiKeyMode: TransactionMode;
  reason?: string;
  ip: string;
  userAgent: string;
}

export class RefundService {
  /**
   * Estorna uma transação já aprovada. Sequência importa: só reverte
   * ledger/wallet DEPOIS de confirmar o estorno na adquirente — nunca antes.
   * Reverter os livros sem essa confirmação criaria uma divergência contábil
   * real (livro diz "estornado", adquirente nunca devolveu o dinheiro pro
   * comprador).
   */
  static async createRefund(params: CreateRefundParams): Promise<ITransaction> {
    const { transactionId, merchantUserId, apiKeyMode, reason, ip, userAgent } = params;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      userId: merchantUserId,
      mode: apiKeyMode,
    });

    if (!transaction) {
      throw new RefundError("Pagamento não encontrado.", "not_found", 404);
    }
    if (transaction.status === "refunded") {
      throw new RefundError("Esse pagamento já foi estornado.", "already_refunded", 400);
    }
    if (transaction.status !== "approved") {
      throw new RefundError(
        `Só é possível estornar pagamentos com status "paid". Status atual: "${transaction.status}".`,
        "not_refundable",
        400
      );
    }
    if (transaction.mode !== "live") {
      throw new RefundError(
        "Estorno de pagamentos em modo teste não é suportado — modo teste não move dinheiro real.",
        "test_mode_not_supported",
        400
      );
    }

    const seller = await Seller.findOne({ userId: transaction.userId });
    if (!seller) throw new RefundError("Vendedor não encontrado.", "seller_not_found", 404);

    const acquirerKey = (seller as any).acquirer || "zendry";
    const acquirer = resolveAcquirer(acquirerKey);

    if (!acquirer.refund) {
      throw new RefundError(`Estorno não suportado pela adquirente "${acquirerKey}".`, "acquirer_refund_unsupported", 501);
    }

    // 1) Confirma o estorno NA ADQUIRENTE primeiro.
    try {
      await acquirer.refund(transaction.externalId || "");
    } catch (err: any) {
      throw new RefundError(err?.message || "Erro ao processar estorno na adquirente.", "acquirer_refund_failed", 502);
    }

    // 2) Só agora reverte ledger + wallet, atomicamente.
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await reverseTransactionLedgerAndWallet(transaction, session, reason || "Estorno solicitado via API");
      transaction.status = "refunded";
      transaction.refund = { reason, refundedAt: new Date() };
      await transaction.save({ session });
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      // Situação grave: adquirente já devolveu o dinheiro, mas nossos livros
      // não refletem isso. Não é um erro "tente de novo" — precisa de
      // reconciliação manual imediata (ver o valor revertido na adquirente
      // vs. o que ainda está retido/disponível na wallet do seller). Loga na
      // auditoria mesmo fora da sessão abortada, pra não depender só do log
      // de console pra alguém notar.
      await TransactionAuditService.log({
        transactionId: transaction._id as Types.ObjectId,
        sellerId: seller._id as Types.ObjectId,
        userId: transaction.userId,
        amount: transaction.amount,
        method: transaction.method,
        status: "blocked",
        kycStatus: seller.status,
        ipAddress: ip,
        userAgent,
        buyerDocument: transaction.purchaseData?.customer?.document,
        flags: [],
        description: `RECONCILIAÇÃO MANUAL URGENTE: estorno confirmado na adquirente mas reversão interna do ledger falhou: ${(err as Error).message}`,
      }).catch((auditErr) => console.error("❌ Falha ao registrar auditoria de reversão malsucedida:", auditErr));

      throw new RefundError(
        `Estorno confirmado na adquirente, mas falhou ao reverter o ledger interno: ${(err as Error).message}. Requer reconciliação manual urgente.`,
        "internal_reversal_failed",
        500
      );
    } finally {
      session.endSession();
    }

    await TransactionAuditService.log({
      transactionId: transaction._id as Types.ObjectId,
      sellerId: seller._id as Types.ObjectId,
      userId: transaction.userId,
      amount: transaction.amount,
      method: transaction.method,
      status: "refunded",
      kycStatus: seller.status,
      ipAddress: ip,
      userAgent,
      buyerDocument: transaction.purchaseData?.customer?.document,
      flags: [],
      description: reason || "Estorno solicitado via API",
    });

    void dispatchWebhookEvent(String(seller._id), "refund.succeeded", toPublicPayment(transaction));

    return transaction;
  }
}
