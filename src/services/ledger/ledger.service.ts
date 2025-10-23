import mongoose from "mongoose";
import { createHash } from "crypto";
import LedgerEntryModel, { LedgerEntryType } from "../../models/ledger/ledgerEntry.model";
import { LEDGER_ACCOUNTS } from "../../config/ledger-accounts";

/* -------------------------------------------------------------------------- */
/* 📘 Tipagens de Entrada                                                     */
/* -------------------------------------------------------------------------- */
interface PostLedgerEntryInput {
  account: string; // usar LEDGER_ACCOUNTS
  type: LedgerEntryType; // "debit" | "credit"
  amount: number;
  currency?: "BRL";
}

interface PostLedgerContext {
  idempotencyKey: string;
  transactionId: string;
  sellerId: string;
  source: {
    system: string; // origem (transactions, cashout, webhook, etc)
    acquirer?: string; // adquirente usada
    ip?: string; // IP ou host
  };
  eventAt?: Date;
}

/* -------------------------------------------------------------------------- */
/* 🧾 postLedgerEntries – Escritura contábil com dupla-entrada e hash         */
/* -------------------------------------------------------------------------- */
/**
 * Registra um batch contábil com dupla-entrada, controle de idempotência
 * e hash sequencial para garantir integridade.
 *
 * Cada batch deve conter, no mínimo, 2 lançamentos (um débito e um crédito)
 * com soma exata entre débitos e créditos.
 */
export async function postLedgerEntries(
  entries: PostLedgerEntryInput[],
  ctx: PostLedgerContext
): Promise<void> {
  if (entries.length < 2) {
    throw new Error("Batch contábil inválido: é necessário pelo menos 2 lançamentos (débito + crédito).");
  }

  const debitSum = entries
    .filter((e) => e.type === "debit")
    .reduce((acc, e) => acc + e.amount, 0);

  const creditSum = entries
    .filter((e) => e.type === "credit")
    .reduce((acc, e) => acc + e.amount, 0);

  if (debitSum !== creditSum) {
    throw new Error(`Batch desbalanceado: Débito=${debitSum} ≠ Crédito=${creditSum}`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 🔐 Verifica duplicidade
    const exists = await LedgerEntryModel.findOne({ idempotencyKey: ctx.idempotencyKey }).session(session);
    if (exists) {
      console.warn(`[Ledger] ⚠️ Já existe batch com idempotencyKey: ${ctx.idempotencyKey}`);
      await session.abortTransaction();
      return;
    }

    const batchId = new mongoose.Types.ObjectId();
    const createdAt = new Date();
    let cumulativeHash = "";

    // 🔁 Criação sequencial com hash cumulativo
    const docs = entries.map((entry, index) => {
      const hashInput = `${cumulativeHash}|${entry.account}|${entry.type}|${entry.amount}|${entry.currency || "BRL"}`;
      cumulativeHash = createHash("sha256").update(hashInput).digest("hex");

      return {
        batchId,
        sequence: index,
        transactionId: ctx.transactionId,
        sellerId: ctx.sellerId,
        account: entry.account,
        type: entry.type,
        amount: entry.amount,
        currency: entry.currency || "BRL",
        idempotencyKey: ctx.idempotencyKey,
        sideHash: cumulativeHash,
        source: ctx.source,
        createdAt,
        eventAt: ctx.eventAt || createdAt,
      };
    });

    await LedgerEntryModel.insertMany(docs, { session });
    await session.commitTransaction();

    console.log(`📘 [Ledger] Batch ${batchId} registrado com sucesso (${entries.length} lançamentos).`);
  } catch (err) {
    await session.abortTransaction();
    console.error("❌ [Ledger] Falha ao registrar batch:", err);
    throw err;
  } finally {
    session.endSession();
  }
}

/* -------------------------------------------------------------------------- */
/* 🧮 Utilitários de Lançamentos (para uso futuro)                            */
/* -------------------------------------------------------------------------- */

/**
 * Registra uma provisão automática de risco em 5% do valor da transação.
 * Pode ser usada em transaction.service.ts.
 */
export function calculateRiskReserve(amount: number, percent = 0.05): number {
  return Math.round(amount * percent * 100) / 100;
}

/**
 * Exemplo de batch de reserva de risco (pode ser usado em venda aprovada)
 */
export async function registerRiskReserve(
  transactionId: string,
  sellerId: string,
  amount: number
): Promise<void> {
  const reserve = calculateRiskReserve(amount);
  await postLedgerEntries(
    [
      { account: LEDGER_ACCOUNTS.RESERVA_RISCO, type: "credit", amount: reserve },
      { account: LEDGER_ACCOUNTS.PASSIVO_SELLER, type: "debit", amount: reserve },
    ],
    {
      idempotencyKey: `risk:${transactionId}`,
      transactionId,
      sellerId,
      source: { system: "transactions", acquirer: "pagarme" },
    }
  );
}
