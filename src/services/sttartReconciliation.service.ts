import { Transaction } from "../models/transaction.model";
import { getPixChargeStatus } from "../lib/sttart/pix";
import { applyZendryPaymentStatus } from "./zendryPaymentStatus.service";

/**
 * Rede de segurança pro lado Sttart, espelhando zendryReconciliation.service.ts
 * — mesma desconfiança de webhook que já rendeu problema real com a Zendry
 * (webhook não confirmado/atrasado). Diferença de forma: a Zendry documenta
 * uma listagem paginada (/v1/pix/qrcodes) que dá pra varrer inteira; não
 * temos confirmação de endpoint equivalente pra Sttart (ver ressalva em
 * lib/sttart/pix.ts), então aqui consultamos DIRETO, uma por uma, as
 * transações Sttart que já sabemos estar pendentes no nosso banco — mais
 * chamadas, mas não depende de um endpoint de listagem não confirmado.
 *
 * `applyZendryPaymentStatus` (nome herdado, comportamento genérico — só
 * aplica status numa Transaction por externalId, não depende de qual
 * adquirente processou) é reaproveitada sem mudança nenhuma.
 */
const MIN_AGE_MINUTES = 0.5;
const MAX_TRANSACTIONS_PER_RUN = 200;

export interface SttartReconciliationResult {
  checked: number;
  updated: number;
  errors: { transactionId: string; error: string }[];
}

export async function checkSingleSttartPix(externalId: string): Promise<{ applied: boolean }> {
  try {
    const result = await getPixChargeStatus(externalId);
    if (result.status === "pending") return { applied: false };
    const applyResult = await applyZendryPaymentStatus(externalId, result.status);
    return { applied: applyResult.applied };
  } catch (err) {
    console.error(`⚠️ Checagem ao vivo do Pix Sttart falhou (${externalId}):`, (err as Error).message);
    return { applied: false };
  }
}

export async function reconcilePendingSttartPix(): Promise<SttartReconciliationResult> {
  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000);

  const pending = await Transaction.find({
    method: "pix",
    mode: "live",
    status: "pending",
    createdAt: { $lte: cutoff },
    acquirer: "sttart",
  }).limit(MAX_TRANSACTIONS_PER_RUN);

  const result: SttartReconciliationResult = { checked: pending.length, updated: 0, errors: [] };

  for (const tx of pending) {
    if (!tx.externalId) continue;
    try {
      const statusResult = await getPixChargeStatus(tx.externalId);
      if (statusResult.status === "pending") continue;

      const applyResult = await applyZendryPaymentStatus(tx.externalId, statusResult.status);
      if (applyResult.applied) result.updated++;
    } catch (err) {
      result.errors.push({ transactionId: String(tx._id), error: (err as Error).message });
    }
  }

  return result;
}
