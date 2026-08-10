import CashoutRequest from "../models/cashoutRequest.model";
import { getPixPaymentStatus } from "../lib/zendry/pixPayout";

/**
 * Rede de segurança pro saque em Pix (envio, não recebimento) — mesma
 * lógica de desconfiança que já vale pro resto da API Zendry: webhook
 * documentado ("uma vez identificada mudança de status, a API manda uma
 * mensagem") nunca foi confirmado chegando de verdade nesta conta (ver
 * zendryReconciliation.service.ts, mesmo problema do lado de receber Pix).
 * Sem isso, um saque que ficasse "authorization_pending"/"sent" na Zendry
 * nunca atualizaria o `providerStatus` que a gente mostra pro master.
 *
 * Só ATUALIZA status pra exibição/auditoria — nunca reverte saldo nem
 * refaz envio. O dinheiro já saiu (ou não) na chamada original de
 * sendPixPayment; isso aqui só reflete o que a Zendry diz que aconteceu.
 */
export async function reconcilePixPayoutStatuses(): Promise<{ checked: number; updated: number }> {
  const pending = await CashoutRequest.find({
    rail: "pix",
    status: "approved",
    externalReference: { $exists: true, $ne: null },
    providerStatus: { $nin: ["completed", "canceled"] },
  }).limit(200);

  let updated = 0;

  for (const cashout of pending) {
    try {
      const result = await getPixPaymentStatus(cashout.externalReference!);
      if (result.status !== cashout.providerStatus) {
        cashout.providerStatus = result.status;
        await cashout.save();
        updated++;
      }
    } catch (err) {
      console.error(`⚠️ Falha ao consultar status do saque PIX ${(cashout._id as { toString(): string }).toString()}:`, err);
    }
  }

  return { checked: pending.length, updated };
}
