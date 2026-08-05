import { ClientSession, Types } from 'mongoose';
import LedgerEntryModel, { LedgerEntryType } from '../../models/ledger/ledgerEntry.model';
import { createHash } from 'crypto';

// Tolerância pra comparar soma de débito/crédito — evita que arredondamentos
// independentes (ex.: várias linhas de split, cada uma arredondada pra 2 casas)
// disparem "desbalanceado" por uma diferença de fração de centavo que não é um
// erro real de contabilidade.
const BALANCE_EPSILON = 0.005;

interface PostLedgerEntryInput {
  account: string;
  type: LedgerEntryType;
  amount: number;
  currency?: 'BRL';
  /** Sobrepõe ctx.sellerId só nesta linha — usado quando um batch reparte
   * dinheiro entre vários sellers (ex.: split de pagamentos), onde cada
   * linha de crédito pertence a um seller diferente do dono da transação. */
  sellerId?: string;
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
 * Registra lançamentos contábeis (D/C) com dupla-entrada, hash e idempotência.
 *
 * IMPORTANTE: recebe a `session` do CHAMADOR (obrigatório) — não abre nem
 * commita/aborta transação própria. O ledger precisa ser atômico junto com a
 * Transaction/wallet que ele descreve; se rodasse na própria sessão, um
 * lançamento contábil podia ficar commitado permanentemente mesmo que a
 * operação que o originou fosse revertida logo depois (ex.: falha ao salvar
 * a wallet de um recipient de split, já dentro da mesma requisição).
 */
export async function postLedgerEntries(
  entries: PostLedgerEntryInput[],
  ctx: PostLedgerContext,
  session: ClientSession
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

  if (Math.abs(debitSum - creditSum) > BALANCE_EPSILON) {
    throw new Error(`Lançamentos desbalanceados: Débito=${debitSum} ≠ Crédito=${creditSum}`);
  }

  // Evita duplicação — se já existe, a operação já foi registrada antes
  // (ex.: retry de webhook); não é um erro, só não repete o insert. Como não
  // é dono da sessão, NÃO aborta a transação do chamador — deixa o resto da
  // operação seguir normalmente.
  const exists = await LedgerEntryModel.findOne({ idempotencyKey: ctx.idempotencyKey }).session(session);
  if (exists) {
    console.warn(`[Ledger] Já existe entrada para idempotencyKey: ${ctx.idempotencyKey}`);
    return;
  }

  const batchId = new Types.ObjectId();
  const createdAt = new Date();
  let cumulativeHash = '';

  const docs = entries.map((entry, i) => {
    const hashInput = `${cumulativeHash}|${entry.account}|${entry.type}|${entry.amount}|${entry.currency || 'BRL'}`;
    cumulativeHash = createHash('sha256').update(hashInput).digest('hex');

    return {
      transactionId: ctx.transactionId,
      sellerId: entry.sellerId ?? ctx.sellerId,
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

  console.log(`[Ledger] ✅ Batch registrado com sucesso. ID: ${batchId}`);
}
