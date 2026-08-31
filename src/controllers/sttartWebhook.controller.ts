import { Request, Response } from "express";
import { Transaction } from "../models/transaction.model";
import { SttartWebhookEvent } from "../models/sttartWebhookEvent.model";
import { SttartUnrecognizedWebhook } from "../models/sttartUnrecognizedWebhook.model";
import { findWebhookSignatureHeader, verifyWebhookHmacSignature, parseSttartWebhook } from "../lib/sttart/webhook";
import { applyZendryPaymentStatus } from "../services/zendryPaymentStatus.service";

/**
 * POST /api/transactions/webhook/sttart
 *
 * Recebe confirmações de Pix (cash-in) da Sttart. Mais simples que o
 * equivalente Zendry (zendryWebhook.controller.ts) porque a Sttart só manda
 * webhook de cash-in — cash-out não tem webhook documentado, só polling
 * (ver lib/sttart/payout.ts e sttartReconciliation.service.ts).
 *
 * Autenticação confirmada ao vivo em 2026-08-31 (ver lib/sttart/webhook.ts):
 * não é HMAC, é o header customizado configurado no cadastro do endpoint
 * (customHeaders, POST /v1/api/webhook/webhook-endpoints).
 */
export const sttartWebhook = async (req: Request, res: Response): Promise<void> => {
  const hmacSecret = process.env.STTART_WEBHOOK_SECRET || "";
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  let hmacOk = false;
  if (hmacSecret && rawBody) {
    const found = findWebhookSignatureHeader(req.headers as Record<string, unknown>);
    if (found) {
      hmacOk = verifyWebhookHmacSignature(rawBody, found.value, hmacSecret);
      if (!hmacOk) {
        console.warn(`⚠️ Webhook Sttart: assinatura no header "${found.header}" não bateu.`);
      }
    } else {
      console.warn("⚠️ Webhook Sttart sem assinatura reconhecida. Headers recebidos:", Object.keys(req.headers));
    }
  }

  if (!hmacOk) {
    res.status(401).json({ status: false, msg: "Não autorizado." });
    return;
  }

  try {
    const event = parseSttartWebhook(req.body);
    if (!event) {
      console.warn("⚠️ Webhook Sttart autenticado mas não reconhecido (corpo fora do envelope esperado):", req.body);
      void SttartUnrecognizedWebhook.create({ headers: req.headers, body: req.body }).catch((err) =>
        console.error("⚠️ Falha ao registrar webhook Sttart não reconhecido:", err)
      );
      res.status(200).json({ status: true });
      return;
    }

    try {
      await SttartWebhookEvent.create({
        eventId: event.eventId,
        eventType: event.eventType,
        rawPayload: event.raw,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        res.status(200).json({ status: true, msg: "Evento já processado." });
        return;
      }
      throw err;
    }

    // A Sttart usa IDs diferentes em `resource.id` dependendo do evento:
    // transaction.created manda o txid (Transaction.externalId), mas
    // transaction.succeeded/failed/etc manda o apiTransactionId
    // (Transaction.secondaryExternalId) — confirmado ao vivo em 2 pagamentos
    // reais (2026-08-31). Resolve por qualquer um dos dois antes de aplicar
    // o status, sempre usando o externalId real da transação encontrada
    // (applyZendryPaymentStatus não muda, continua fazendo seu próprio lookup).
    const tx = await Transaction.findOne({
      $or: [{ externalId: event.externalId }, { secondaryExternalId: event.externalId }],
    }).select("externalId");

    const result = tx?.externalId
      ? await applyZendryPaymentStatus(tx.externalId, event.status)
      : { applied: false, newlyApproved: false, newlyFailed: false };
    console.log(
      `✅ Webhook Sttart processado: eventType=${event.eventType} resourceId=${event.externalId} matchedTransaction=${!!tx} applied=${result.applied} newlyApproved=${result.newlyApproved}`
    );

    res.status(200).json({ status: true });
  } catch (error) {
    console.error("❌ Erro no webhook da Sttart:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao processar webhook." });
  }
};
