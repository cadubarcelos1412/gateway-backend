import mongoose, { Types } from "mongoose";
import { Transaction, ITransaction } from "../models/transaction.model";
import { Seller } from "../models/seller.model";
import { Wallet } from "../models/wallet.model";
import { postLedgerEntries } from "./ledger/ledger.service";
import { reverseTransactionLedgerAndWallet } from "./ledger/reversal.service";
import { dispatchWebhookEvent, dispatchPlatformWebhookEvent } from "./webhook.service";
import { toPublicPayment } from "../utils/publicPayment";
import type { ZendryVerificationStatus } from "../lib/zendry/types";

interface ApplyResult {
  applied: boolean;
  newlyApproved: boolean;
  newlyFailed: boolean;
}

interface SplitAllocation {
  recipientSellerId: string;
  recipientName?: string;
  percentage: number;
  amount: number;
}

/**
 * Credita ledger + wallet(s) de verdade — só chamado quando a Zendry confirma
 * que o dinheiro realmente chegou. Corrigido em 2026-08-10: antes disso, esse
 * crédito acontecia na CRIAÇÃO da transação (transaction.service.ts), como
 * reserva otimista — "assume que vai ser pago". Combinado com Pix sendo D+0
 * (RetentionEngine) e a liberação automática de saldo (wallet.service.ts), um
 * Pix gerado e nunca pago virava saldo DISPONÍVEL/SACÁVEL em minutos, sem o
 * comprador ter pago nada. Achado com R$10.440,11 de saldo fantasma em
 * produção — ver scripts/check-wallet-vs-approved-all.mjs. Idempotente via
 * transaction.creditedAt (defesa extra além do check de status em
 * applyZendryPaymentStatus, pro caso de duas chamadas concorrentes lerem o
 * status antes de qualquer uma salvar).
 */
async function creditTransactionLedgerAndWallet(transaction: ITransaction, session: mongoose.ClientSession): Promise<void> {
  if (transaction.mode !== "live") return; // modo teste nunca toca ledger/wallet
  if (transaction.creditedAt) return; // já creditada — evita duplo crédito

  const txId = transaction._id as Types.ObjectId;
  const splitAllocations = ((transaction.metadata as any)?.splits || []) as SplitAllocation[];
  const totalSplitAmount = splitAllocations.reduce((sum, a) => sum + a.amount, 0);
  const sellerShare = transaction.netAmount - totalSplitAmount;

  const seller = await Seller.findOne({ userId: transaction.userId }).session(session);
  if (!seller) throw new Error(`Seller não encontrado pra creditar a transação ${txId}.`);

  const acquirerKey = (seller as any).acquirer || "zendry";

  await postLedgerEntries(
    [
      { account: "contas_a_receber_adquirente", type: "debit", amount: transaction.amount },
      { account: "passivo_seller", type: "credit", amount: sellerShare },
      ...splitAllocations.map((a) => ({
        account: "passivo_seller",
        type: "credit" as const,
        amount: a.amount,
        sellerId: a.recipientSellerId.toString(),
      })),
      { account: "receita_taxa_kissa", type: "credit", amount: transaction.fee },
    ],
    {
      idempotencyKey: `txn:${txId.toString()}`,
      transactionId: txId.toString(),
      sellerId: (seller._id as Types.ObjectId).toString(),
      source: { system: "transactions", acquirer: acquirerKey },
      eventAt: new Date(),
    },
    session
  );

  // Pix é sempre D+0 (RetentionEngine trava isso independente de política de
  // risco); cartão/boleto usam os dias calculados na criação, contados a
  // partir da CONFIRMAÇÃO agora, não da criação da cobrança.
  const availableIn =
    transaction.method === "pix"
      ? new Date()
      : new Date(Date.now() + transaction.retentionDays * 24 * 60 * 60 * 1000);

  const methodForLog = transaction.method === "credit_card" ? "card" : transaction.method === "boleto" ? "bill" : "pix";

  if (splitAllocations.length > 0) {
    const recipientSellers = await Seller.find({
      _id: { $in: splitAllocations.map((a) => a.recipientSellerId) },
    }).session(session);
    const sellerIdToUserId = new Map(recipientSellers.map((s) => [String(s._id), s.userId]));

    for (const allocation of splitAllocations) {
      const recipientUserId = sellerIdToUserId.get(String(allocation.recipientSellerId));
      if (!recipientUserId) continue; // segurança — não deveria acontecer, regra já valida na criação

      const recipientWallet = await Wallet.findOne({ userId: recipientUserId }).session(session);
      if (!recipientWallet) continue;

      recipientWallet.balance.unAvailable.push({
        amount: allocation.amount,
        availableIn,
        originTransactionId: txId,
        method: methodForLog,
      });
      recipientWallet.log.push({
        transactionId: txId,
        type: "topup",
        method: methodForLog,
        amount: allocation.amount,
        security: { createdAt: new Date(), ipAddress: "system", userAgent: "payment-confirmation" },
      });
      await recipientWallet.save({ session });

      // 📊 Registro só de leitura pra Vendas/Dashboard do destinatário — até
      // aqui (2026-08-12) o repasse de parceria só existia como
      // wallet.log/balance.unAvailable, então o saldo subia mas não
      // aparecia em nenhum lugar como venda. Não passa por
      // createTransactionCore (não é um pagamento novo, é reporting puro),
      // então não gera fee/split-de-split nem mexe no ledger de novo — o
      // crédito de verdade já aconteceu acima.
      await Transaction.create(
        [
          {
            userId: recipientUserId,
            amount: allocation.amount,
            fee: 0,
            netAmount: allocation.amount,
            retention: 0,
            retentionDays: 0,
            type: "deposit",
            method: transaction.method,
            status: "approved",
            mode: "live",
            description: `Repasse de parceria de ${seller.name}`,
            externalId: `${transaction.externalId || txId.toString()}:split:${String(allocation.recipientSellerId)}`,
            createdAt: new Date(),
            creditedAt: new Date(),
            metadata: {
              source: "partner_split",
              splitFrom: {
                payingSellerId: String(seller._id),
                payingSellerName: seller.name,
                percentage: allocation.percentage,
                originalAmount: transaction.amount,
                originalTransactionId: txId.toString(),
              },
            },
          },
        ],
        { session }
      );
    }
  }

  const wallet = await Wallet.findOne({ userId: transaction.userId }).session(session);
  if (!wallet) throw new Error(`Carteira não encontrada pra creditar a transação ${txId}.`);

  wallet.balance.unAvailable.push({
    amount: sellerShare - transaction.retention,
    availableIn,
    originTransactionId: txId,
    method: methodForLog,
  });
  wallet.log.push({
    transactionId: txId,
    type: "topup",
    method: methodForLog,
    amount: sellerShare - transaction.retention,
    security: {
      createdAt: new Date(),
      ipAddress: "system",
      userAgent: "payment-confirmation",
      riskFlags: transaction.riskFlags,
    },
  });
  await wallet.save({ session });

  transaction.creditedAt = new Date();
  await transaction.save({ session });
}

/**
 * Único ponto que aplica uma mudança de status vinda da Zendry numa
 * Transaction — usado tanto pelo webhook (zendryWebhook.controller.ts)
 * quanto pela reconciliação periódica (reconciliation.service.ts), pra não
 * duplicar a lógica de crédito/reversão de ledger/wallet.
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
    newlyApproved = true;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      transaction.status = "approved";
      await transaction.save({ session });
      await creditTransactionLedgerAndWallet(transaction, session);
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
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
    if (newlyFailed) {
      void dispatchPlatformWebhookEvent("platform.payment_failed", {
        ...toPublicPayment(transaction),
        sellerId: seller ? String(seller._id) : undefined,
        sellerName: seller?.name,
      });
    }
  }

  return { applied: newlyApproved || newlyFailed, newlyApproved, newlyFailed };
}
