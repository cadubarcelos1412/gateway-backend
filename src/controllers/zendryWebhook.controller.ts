import { Request, Response } from "express";
import { ZendryWebhookEvent } from "../models/zendryWebhookEvent.model";
import { ZendryWebhookRawLog } from "../models/zendryWebhookRawLog.model";
import {
  verifyWebhookSecret,
  parseZendryWebhook,
  parseZendryNativeWebhook,
  findWebhookSignatureHeader,
  verifyWebhookHmacSignature,
} from "../lib/zendry/webhook";
import { applyZendryPaymentStatus } from "../services/zendryPaymentStatus.service";
import { applyZendryPixPayoutWebhookStatus } from "../services/pixPayoutReconciliation.service";

/**
 * POST /api/transactions/webhook/zendry
 *
 * Recebe confirmações de Pix (`pix_qrcode`) e cartão (`card_payment`) da
 * Zendry. Esta é a URL cadastrada no painel novo da Zendry, TANTO no campo
 * "Webhook de recebimento (Pix recebido)" QUANTO em "Webhook de saque (Pix
 * enviado)" (modo Legado — mesmo formato de payload de antes, só a
 * autenticação mudou) — a Zendry não oferece dois endpoints separados no
 * painel pra isso, então um único handler decide o que fazer com o evento:
 * primeiro tenta como recebimento (Transaction por externalId); se não
 * achar nada, tenta como saque (CashoutRequest por externalReference). Os
 * dois lados nunca colidem: reference_code de cobrança PIX e de envio PIX
 * vêm de endpoints diferentes da Zendry, e cada evento só bate num dos dois.
 *
 * Aceita DOIS mecanismos de autenticação, em ordem:
 * 1) `?key=SEU_ZENDRY_WEBHOOK_SECRET` — mecanismo antigo, mantido por
 *    retrocompatibilidade (não deve fazer diferença prática: nunca foi
 *    confirmado ninguém enviando com esse formato pro domínio novo).
 * 2) Assinatura HMAC-SHA256 em um header (ver findWebhookSignatureHeader em
 *    lib/zendry/webhook.ts pra lista de nomes de header aceitos e por quê —
 *    o nome exato ainda não foi confirmado pelo suporte da Zendry).
 *
 * ⚠️ Histórico: confirmado em produção em 2026-08-06 que nenhum webhook da
 * Zendry chegava aqui — a URL de callback nunca tinha sido cadastrada (nem
 * no domínio antigo, nem agora no painel novo até este fix, 2026-08-20). Por
 * isso existe zendryReconciliation.service.ts — poll periódico que consulta
 * a Zendry direto e aplica a mesma lógica daqui (applyZendryPaymentStatus),
 * como rede de segurança independente de webhook chegar ou não. Mantenha
 * esse poll mesmo depois deste fix, até confirmar webhooks reais chegando.
 */
export const zendryWebhook = async (req: Request, res: Response): Promise<void> => {
  const providedKey = typeof req.query.key === "string" ? req.query.key : null;
  const legacyKeyOk = verifyWebhookSecret(providedKey, process.env.ZENDRY_WEBHOOK_SECRET || "");

  let hmacOk = false;
  if (!legacyKeyOk) {
    const hmacSecret = process.env.ZENDRY_HMAC_WEBHOOK_SECRET || "";
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (hmacSecret && rawBody) {
      const found = findWebhookSignatureHeader(req.headers as Record<string, unknown>);
      if (found) {
        hmacOk = verifyWebhookHmacSignature(rawBody, found.value, hmacSecret);
        if (hmacOk) {
          console.log(`✅ Webhook Zendry autenticado via header "${found.header}".`);
        } else {
          console.warn(`⚠️ Webhook Zendry: assinatura no header "${found.header}" não bateu.`);
        }
      } else {
        // Nenhum dos headers candidatos apareceu — loga os NOMES recebidos
        // (nunca valores) pra descobrir o header real assim que a Zendry
        // mandar tráfego de verdade.
        console.warn("⚠️ Webhook Zendry sem assinatura reconhecida. Headers recebidos:", Object.keys(req.headers));
      }
    }
  }

  // 🩺 Log de diagnóstico temporário (ver ZendryWebhookRawLog) — captura
  // TUDO que chega aqui, autenticado ou não, parseado ou não. Fire-and-
  // forget: um erro salvando o log nunca pode derrubar o processamento
  // real do webhook.
  void ZendryWebhookRawLog.create({
    headers: req.headers,
    body: req.body,
    authOk: legacyKeyOk || hmacOk,
    authMethod: legacyKeyOk ? "legacy_key" : hmacOk ? "hmac" : "none",
  }).catch((err) => console.error("⚠️ Falha ao salvar log de diagnóstico do webhook Zendry:", err));

  if (!legacyKeyOk && !hmacOk) {
    res.status(401).json({ status: false, msg: "Não autorizado." });
    return;
  }

  try {
    const event = parseZendryWebhook(req.body) || parseZendryNativeWebhook(req.body);
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

    const depositResult = await applyZendryPaymentStatus(event.externalId, event.status);
    if (!depositResult.applied) {
      // Não bateu com nenhuma Transaction (recebimento) — tenta como evento
      // de saque (Pix enviado). Ver applyZendryPixPayoutWebhookStatus.
      await applyZendryPixPayoutWebhookStatus(event.externalId, event.rawStatus);
    }

    res.status(200).json({ status: true });
  } catch (error) {
    console.error("❌ Erro no webhook da Zendry:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao processar webhook." });
  }
};
