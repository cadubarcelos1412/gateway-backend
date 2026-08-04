import { Request, Response } from "express";
import { Transaction } from "../models/transaction.model";
import { ZendryWebhookEvent } from "../models/zendryWebhookEvent.model";
import { Seller } from "../models/seller.model";
import { verifyWebhookSecret, parseZendryWebhook } from "../lib/zendry/webhook";
import { dispatchWebhookEvent } from "../services/webhook.service";
import { toPublicPayment } from "../utils/publicPayment";

/**
 * POST /api/transactions/webhook/zendry?key=SEU_ZENDRY_WEBHOOK_SECRET
 *
 * Recebe confirmações de Pix (`pix_qrcode`) e cartão (`card_payment`) da
 * Zendry. Ao contrário do webhook genérico (Pagar.me), a autenticidade é
 * validada por um segredo nosso na query string (`?key=`) — ver
 * ZENDRY-MIGRATION.md, seção Webhooks, sobre a divergência com o mecanismo
 * oficial (header Authorization) e por que esse projeto usa o da query.
 *
 * ⚠️ Limitação conhecida (herdada do webhook genérico já existente pra
 * Pagar.me): quando a transação vira "failed", este endpoint só atualiza
 * `transaction.status` — não estorna os lançamentos de ledger nem a entrada
 * de wallet feitos no momento da CRIAÇÃO da transação. Esse gap já existe
 * hoje pro Pagar.me e não é corrigido aqui.
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

    const transaction = await Transaction.findOne({ externalId: event.externalId });
    if (transaction) {
      let newlyApproved = false;
      let newlyFailed = false;

      if (event.status === "approved" && transaction.status !== "approved") {
        transaction.status = "approved";
        newlyApproved = true;
        await transaction.save();
      } else if (
        (event.status === "rejected" || event.status === "cancelled") &&
        transaction.status === "pending"
      ) {
        transaction.status = "failed";
        newlyFailed = true;
        await transaction.save();
      }
      // status "pending" — nada a fazer.

      if (newlyApproved || newlyFailed) {
        const seller = await Seller.findOne({ userId: transaction.userId });
        if (seller) {
          void dispatchWebhookEvent(
            String(seller._id),
            newlyApproved ? "payment.paid" : "payment.failed",
            toPublicPayment(transaction)
          );
        }
      }
    }

    res.status(200).json({ status: true });
  } catch (error) {
    console.error("❌ Erro no webhook da Zendry:", error);
    res.status(500).json({ status: false, msg: "Erro interno ao processar webhook." });
  }
};
