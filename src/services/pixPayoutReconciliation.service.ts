import { Types } from "mongoose";
import CashoutRequest from "../models/cashoutRequest.model";
import { getPixPaymentStatus } from "../lib/zendry/pixPayout";
import { CashoutService } from "./cashout.service";

/**
 * Rede de segurança pro saque em Pix (envio, não recebimento) — mesma
 * lógica de desconfiança que já vale pro resto da API Zendry: webhook
 * documentado ("uma vez identificada mudança de status, a API manda uma
 * mensagem") nunca foi confirmado chegando de verdade nesta conta (ver
 * zendryReconciliation.service.ts, mesmo problema do lado de receber Pix).
 * Sem isso, um saque que ficasse "authorization_pending"/"sent" na Zendry
 * nunca atualizaria o `providerStatus` que a gente mostra pro master.
 *
 * Atualiza status pra exibição/auditoria, e — desde 2026-08-12 — também
 * devolve o saldo pro seller quando a Zendry confirma que CANCELOU o envio
 * (status final "canceled"). Antes disso, o saldo ficava descontado pra
 * sempre mesmo o Pix nunca tendo saído; ver
 * CashoutService.refundFailedPixPayout, que é idempotente. Nunca refaz o
 * envio sozinho — só devolve o dinheiro.
 */
/**
 * Mesma lógica de reconcilePixPayoutStatuses (atualizar providerStatus +
 * devolver saldo se cancelado) mas disparada por webhook em vez de poll —
 * usado pelo endpoint compartilhado "Webhook de saque (Pix enviado)" que o
 * painel novo da Zendry aponta pra cá (ver zendryWebhook.controller.ts).
 * Não sabemos o `notification_type` exato que a Zendry usa pra esses
 * eventos (não documentado), então quem chama tenta casar por
 * externalReference independente do tipo declarado no payload — se não
 * achar CashoutRequest nenhum, é porque o evento era de outra coisa (Pix
 * recebido, cartão) e quem chama já tratou isso antes.
 */
export async function applyZendryPixPayoutWebhookStatus(
  referenceCode: string,
  rawStatus: string | undefined
): Promise<{ applied: boolean }> {
  const cashout = await CashoutRequest.findOne({ rail: "pix", externalReference: referenceCode });
  if (!cashout) return { applied: false };

  if (rawStatus && rawStatus !== cashout.providerStatus) {
    cashout.providerStatus = rawStatus;
    await cashout.save();
  }

  // Mesmo critério de reconcilePixPayoutStatuses: só o status final
  // "canceled" (grafia da própria Zendry) devolve o saldo.
  if (rawStatus === "canceled") {
    await CashoutService.refundFailedPixPayout(
      cashout._id as Types.ObjectId,
      `Zendry cancelou o envio via webhook (status: ${rawStatus}).`
    );
  }

  return { applied: true };
}

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
      if (result.status === "canceled") {
        await CashoutService.refundFailedPixPayout(
          cashout._id as Types.ObjectId,
          `Zendry cancelou o envio (status: ${result.status}).`
        );
      }
    } catch (err) {
      console.error(`⚠️ Falha ao consultar status do saque PIX ${(cashout._id as { toString(): string }).toString()}:`, err);
    }
  }

  return { checked: pending.length, updated };
}
