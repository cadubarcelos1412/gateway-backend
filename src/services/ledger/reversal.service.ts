import { ClientSession, Types } from "mongoose";
import { ITransaction } from "../../models/transaction.model";
import { Wallet, IWallet } from "../../models/wallet.model";
import { Seller } from "../../models/seller.model";
import { postLedgerEntries } from "./ledger.service";

interface SplitAllocation {
  recipientSellerId: string;
  percentage: number;
  amount: number;
}

/**
 * Debita de uma wallet o valor de uma transação específica — primeiro tenta
 * remover a reserva ainda retida (unAvailable, ligada por originTransactionId);
 * se ela já foi liberada (ou nunca foi ligada, para transações criadas antes
 * desta correção), cai para debitar do saldo disponível. Nunca deixa saldo
 * negativo: se não houver de onde tirar o valor (ex.: seller já sacou), lança
 * erro em vez de silenciosamente zerar/negativar a carteira — isso precisa de
 * reconciliação manual, não de uma reversão automática que mente sobre o saldo.
 */
async function debitWalletForTransaction(
  wallet: IWallet,
  transactionId: Types.ObjectId,
  amount: number,
  session: ClientSession,
  method: "card" | "pix" | "bill"
): Promise<void> {
  const bucketIndex = wallet.balance.unAvailable.findIndex(
    (b) => b.originTransactionId?.toString() === transactionId.toString()
  );

  if (bucketIndex >= 0) {
    const bucket = wallet.balance.unAvailable[bucketIndex];
    if (Math.abs(bucket.amount - amount) > 0.01) {
      throw new Error(
        `Reserva retida (${bucket.amount}) não bate com o valor a reverter (${amount}) para a transação ${transactionId}. Requer reconciliação manual.`
      );
    }
    wallet.balance.unAvailable.splice(bucketIndex, 1);
  } else if (wallet.balance.available >= amount) {
    wallet.balance.available -= amount;
  } else {
    throw new Error(
      `Saldo insuficiente para reverter a transação ${transactionId}: nem reserva retida nem saldo disponível cobrem ${amount}. Requer reconciliação manual (provável saque já realizado).`
    );
  }

  wallet.log.push({
    transactionId,
    type: "reversal",
    method,
    amount,
    security: {
      createdAt: new Date(),
      ipAddress: "system",
      userAgent: "reversal.service",
    },
  });

  await wallet.save({ session });
}

/**
 * Reverte os lançamentos de ledger e o impacto em wallet(s) feitos na criação
 * de uma transação "live" — espelha exatamente os lançamentos originais
 * (débito vira crédito e vice-versa) e desfaz a reserva/saldo do seller e de
 * eventuais recipients de split.
 *
 * Usado em dois cenários: (1) a adquirente reporta falha/recusa depois da
 * reserva otimista feita na criação, (2) um estorno de transação já aprovada
 * (RefundService chama isso DEPOIS de confirmar o estorno na adquirente).
 *
 * Idempotente por `transaction.reversedAt` — chamar duas vezes pra mesma
 * transação é um no-op na segunda vez.
 */
export async function reverseTransactionLedgerAndWallet(
  transaction: ITransaction,
  session: ClientSession,
  reason: string
): Promise<void> {
  if (transaction.mode !== "live") return; // modo teste nunca tocou ledger/wallet
  if (transaction.reversedAt) return; // já revertida — evita dupla reversão
  // Desde 2026-08-10, o crédito só acontece na CONFIRMAÇÃO (ver
  // zendryPaymentStatus.service.ts), não mais na criação — uma transação que
  // vai direto de "pending" pra "failed"/"cancelled" sem nunca ter sido
  // aprovada nunca chegou a creditar nada, então não há o que reverter. Sem
  // essa guarda, debitWalletForTransaction cairia no fallback de debitar
  // `available` sem achar a reserva (que nunca existiu), tirando dinheiro de
  // outra transação por engano.
  if (!transaction.creditedAt) return;

  const txId = transaction._id as Types.ObjectId;
  const splitAllocations = ((transaction.metadata as any)?.splits || []) as SplitAllocation[];
  const totalSplitAmount = splitAllocations.reduce((sum, a) => sum + a.amount, 0);
  const sellerShare = transaction.netAmount - totalSplitAmount;

  await postLedgerEntries(
    [
      { account: "contas_a_receber_adquirente", type: "credit", amount: transaction.amount },
      { account: "passivo_seller", type: "debit", amount: sellerShare },
      ...splitAllocations.map((a) => ({
        account: "passivo_seller",
        type: "debit" as const,
        amount: a.amount,
        sellerId: a.recipientSellerId.toString(),
      })),
      { account: "receita_taxa_kissa", type: "debit", amount: transaction.fee },
    ],
    {
      idempotencyKey: `txn:${txId.toString()}:reversal`,
      transactionId: txId.toString(),
      sellerId: transaction.userId.toString(),
      source: { system: "reversal", ip: "system" },
      eventAt: new Date(),
    },
    session
  );

  const methodForLog = transaction.method === "credit_card" ? "card" : transaction.method === "boleto" ? "bill" : "pix";

  const wallet = await Wallet.findOne({ userId: transaction.userId }).session(session);
  if (!wallet) throw new Error(`Wallet não encontrada para reverter a transação ${txId}.`);
  await debitWalletForTransaction(wallet, txId, sellerShare - transaction.retention, session, methodForLog);

  if (splitAllocations.length > 0) {
    const recipientSellers = await Seller.find({
      _id: { $in: splitAllocations.map((a) => a.recipientSellerId) },
    }).session(session);
    const sellerIdToUserId = new Map(recipientSellers.map((s) => [String(s._id), s.userId]));

    for (const allocation of splitAllocations) {
      const recipientUserId = sellerIdToUserId.get(String(allocation.recipientSellerId));
      if (!recipientUserId) continue;

      const recipientWallet = await Wallet.findOne({ userId: recipientUserId }).session(session);
      if (!recipientWallet) continue;

      await debitWalletForTransaction(recipientWallet, txId, allocation.amount, session, methodForLog);
    }
  }

  transaction.reversedAt = new Date();
  await transaction.save({ session });

  console.log(`[Reversal] ✅ Transação ${txId} revertida (motivo: ${reason}).`);
}
