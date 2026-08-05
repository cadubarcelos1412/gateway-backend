import { Request, Response } from "express";
import { ZendryWebhookEvent } from "../models/zendryWebhookEvent.model";
import { verifyWebhookSecret, parseZendryWebhook } from "../lib/zendry/webhook";
import { applyZendryPaymentStatus } from "../services/zendryPaymentStatus.service";

/**
 * POST /api/transactions/webhook/zendry?key=SEU_ZENDRY_WEBHOOK_SECRET
 *
 * Recebe confirmações de Pix (`pix_qrcode`) e cartão (`card_payment`) da
 * Zendry. A autenticidade é validada por um segredo nosso na query string
 * (`?key=`) — ver ZENDRY-MIGRATION.md, seção Webhooks, sobre a divergência
 * com o mecanismo oficial (header Authorization) e por que esse projeto
 * usa o da query.
 *
 * ⚠️ Confirmado em produção em 2026-08-06: nenhum webhook da Zendry chegou
 * aqui, nunca, desde o deploy deste backend — a URL de callback foi
 * registrada manualmente na conta Zendry no projeto ANTERIOR (fora do
 * código, ver lib/zendry/webhook.ts) e provavelmente nunca foi atualizada
 * pra apontar aqui. Por isso existe zendryReconciliation.service.ts — poll
 * periódico que consulta a Zendry direto e aplica a mesma lógica daqui
 * (applyZendryPaymentStatus), como rede de segurança independente de
 * webhook chegar ou não.
 */
export const zendryWebhook = async (req: Request, res: Response): Promise<void> => {
  const providedKey = typeof req.query.key === "string" ? req.query.key : null;
  if (!verifyWebhookSecret(providedKey, process.env.ZENDRY_WEBHOOK_SECRET || "")) {
    res.status(401).json({ status: false, msg: "Não autorizado." });
    return;
  }

  try {
    const event = parseZendryWebhook(req.body);
    if (!event) {
      // Payload não reconhecido — não é um erro de processamento, apenas
      // não é um evento que sabemos interpretar.
      res.status(200).json({ status: true });
      return;
    }

    const action = `${event.notificationType}.${event.status}`;

    try {
      await ZendryWebhookEvent.create({
        externalId: event.externalId,
        action,
        rawPayload: event.raw,
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        // Evento já processado (retry da Zendry) — responde 200 sem repetir.
        res.status(200).json({ status: true, msg: "Evento já processado." });
        return;
      }
      throw err;
    }

    await applyZendryPaymentStatus(event.externalId, event.status);

    res.status(200).json({ status: true });
  } catch (error) {
    console.error("❌ Erro no webhook da Zendry:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao processar webhook." });
  }
};
