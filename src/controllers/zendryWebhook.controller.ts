import { Request, Response } from "express";
import { ZendryWebhookEvent } from "../models/zendryWebhookEvent.model";
import { ZendryUnrecognizedWebhook } from "../models/zendryUnrecognizedWebhook.model";
import { Transaction } from "../models/transaction.model";
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
 * enviado)" — a Zendry não oferece dois endpoints separados no painel pra
 * isso, então um único handler decide o que fazer com o evento: primeiro
 * tenta como recebimento (Transaction por externalId); se não achar nada,
 * tenta como saque (CashoutRequest por externalReference). Os dois lados
 * nunca colidem: reference_code de cobrança PIX e de envio PIX vêm de
 * endpoints diferentes da Zendry, e cada evento só bate num dos dois.
 *
 * Aceita DOIS mecanismos de autenticação, em ordem:
 * 1) `?key=SEU_ZENDRY_WEBHOOK_SECRET` — mecanismo antigo, mantido por
 *    retrocompatibilidade (não deve fazer diferença prática: nunca foi
 *    confirmado ninguém enviando com esse formato pro domínio novo).
 * 2) Assinatura HMAC-SHA256 no header `x-zendry-signature` (formato
 *    `sha256=<hex>`) — CONFIRMADO ao vivo em produção em 2026-08-21, tanto
 *    o modo Nativo (payload `{ event, data: {...} }`, status em português
 *    "pago") quanto — presumivelmente, mesmo mecanismo — o Legado.
 *
 * ⚠️ Histórico: confirmado em produção em 2026-08-06 que nenhum webhook da
 * Zendry chegava aqui — a URL de callback nunca tinha sido cadastrada. Depois
 * (2026-08-20), a URL foi cadastrada mas a assinatura HMAC ainda rejeitava
 * tudo (401) porque ZENDRY_HMAC_WEBHOOK_SECRET não existia nas env vars do
 * Render — corrigido em 2026-08-21. Mantenha
 * zendryReconciliation.service.ts (poll periódico) mesmo assim, como rede de
 * segurança independente pra qualquer falha futura de entrega de webhook.
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

  if (!legacyKeyOk && !hmacOk) {
    res.status(401).json({ status: false, msg: "Não autorizado." });
    return;
  }

  try {
    const event = parseZendryWebhook(req.body) || parseZendryNativeWebhook(req.body);
    if (!event) {
      // Payload não reconhecido — não é um erro de processamento (responde
      // 200 igual), mas registra pra investigar depois. Ver
      // ZendryUnrecognizedWebhook — já aconteceu de um evento real (saque
      // "pix.sent") cair aqui e ficar invisível por horas.
      void ZendryUnrecognizedWebhook.create({ headers: req.headers, body: req.body }).catch((err) =>
        console.error("⚠️ Falha ao registrar webhook Zendry não reconhecido:", err)
      );
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
    // `depositResult.applied` só é true se uma TRANSIÇÃO de status
    // aconteceu — uma Transaction já aprovada antes (retry idempotente da
    // Zendry) bate applied:false mesmo tendo sido "encontrada". Por isso
    // checa existência separado, só pra decidir se vale logar como
    // "não reconhecido" — não influencia o processamento em si.
    const depositFound =
      depositResult.applied || !!(await Transaction.exists({ externalId: event.externalId }));

    let matchedSomething = depositFound;
    if (!depositResult.applied) {
      // Não bateu com nenhuma Transaction (recebimento) — tenta como evento
      // de saque (Pix enviado). Ver applyZendryPixPayoutWebhookStatus.
      const payoutResult = await applyZendryPixPayoutWebhookStatus(event.externalId, event.rawStatus);
      matchedSomething = matchedSomething || payoutResult.applied;
    }

    if (!matchedSomething) {
      // Autenticou, formato reconhecido, mas o externalId não bateu com
      // NENHUMA Transaction nem CashoutRequest — provavelmente o campo
      // errado foi extraído do payload (ver candidatos em
      // parseZendryNativeWebhook). Vale investigar, mas não é um erro que
      // deva devolver 5xx pra Zendry.
      void ZendryUnrecognizedWebhook.create({ headers: req.headers, body: req.body }).catch((err) =>
        console.error("⚠️ Falha ao registrar webhook Zendry não reconhecido:", err)
      );
    }

    res.status(200).json({ status: true });
  } catch (error) {
    console.error("❌ Erro no webhook da Zendry:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao processar webhook." });
  }
};
