// src/controllers/stripe.controller.ts
import { Request, Response } from "express";
import { stripe } from "../config/stripe";
import { Transaction } from "../models/transaction.model";

/* -------------------------------------------------------------------------- */
/* 📡 Webhook da Stripe – Atualiza transações automaticamente                 */
/* -------------------------------------------------------------------------- */
export const stripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
  } catch (err: any) {
    console.error("⚠️ Assinatura inválida no webhook Stripe:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object as any;
        await Transaction.findOneAndUpdate({ externalId: intent.id }, { status: "approved" });
        console.log(`✅ Pagamento aprovado: ${intent.id}`);
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as any;
        await Transaction.findOneAndUpdate({ externalId: intent.id }, { status: "failed" });
        console.log(`❌ Pagamento falhou: ${intent.id}`);
        break;
      }

      case "payment_intent.canceled": {
        const intent = event.data.object as any;
        await Transaction.findOneAndUpdate({ externalId: intent.id }, { status: "failed" });
        console.log(`🛑 Pagamento cancelado: ${intent.id}`);
        break;
      }

      default:
        console.log(`📬 Evento ignorado: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Erro ao processar webhook Stripe:", err);
    res.status(500).json({ status: false, msg: "Erro interno ao processar evento da Stripe." });
  }
};
