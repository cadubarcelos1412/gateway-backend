import mongoose from 'mongoose';
import LedgerEntryModel, { LedgerEntryType } from '../../models/ledger/ledgerEntry.model';
import { createHash } from 'crypto';

interface PostLedgerEntryInput {
  account: string;
  type: LedgerEntryType;
  amount: number;
  currency?: 'BRL';
}

interface PostLedgerContext {
  idempotencyKey: string;
  transactionId: string;
  sellerId: string;
  source: {
    system: string;
    acquirer?: string;
    ip?: string;
  };
  eventAt?: Date;
}

/**
 * Registra lançamentos contábeis (D/C) com dupla-entrada, hash e idempotência
 */
export async function postLedgerEntries(
  entries: PostLedgerEntryInput[],
  ctx: PostLedgerContext
): Promise<void> {
  if (entries.length < 2) {
    throw new Error('Batch contábil inválido: mínimo de 2 lançamentos (debit + credit)');
  }

  const debitSum = entries
    .filter(e => e.type === 'debit')
    .reduce((acc, e) => acc + e.amount, 0);

  const creditSum = entries
    .filter(e => e.type === 'credit')
    .reduce((acc, e) => acc + e.amount, 0);

  if (debitSum !== creditSum) {
    throw new Error(`Lançamentos desbalanceados: Débito=${debitSum} ≠ Crédito=${creditSum}`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Evita duplicação
    const exists = await LedgerEntryModel.findOne({ idempotencyKey: ctx.idempotencyKey }).session(session);
    if (exists) {
      console.warn(`[Ledger] Já existe entrada para idempotencyKey: ${ctx.idempotencyKey}`);
      await session.abortTransaction();
      return;
    }

    const batchId = new mongoose.Types.ObjectId();
    const createdAt = new Date();
    let cumulativeHash = '';

    const docs = entries.map((entry, i) => {
      const hashInput = `${cumulativeHash}|${entry.account}|${entry.type}|${entry.amount}|${entry.currency || 'BRL'}`;
      cumulativeHash = createHash('sha256').update(hashInput).digest('hex');

      return {
        transactionId: ctx.transactionId,
        sellerId: ctx.sellerId,
        batchId,
        sequence: i,
        account: entry.account,
        type: entry.type,
        amount: entry.amount,
        currency: entry.currency || 'BRL',
        sideHash: cumulativeHash,
        idempotencyKey: ctx.idempotencyKey,
        source: ctx.source,
        createdAt,
        eventAt: ctx.eventAt || createdAt
      };
    });

    await LedgerEntryModel.insertMany(docs, { session });
    await session.commitTransaction();

    console.log(`[Ledger] ✅ Batch registrado com sucesso. ID: ${batchId}`);
  } catch (err) {
    await session.abortTransaction();
    console.error(`[Ledger] ❌ Falha ao registrar batch: ${err}`);
    throw err;
  } finally {
    session.endSession();
  }
}
