// src/controllers/stripe.controller.ts
import { Request, Response } from "express";
import { getStripe } from "../config/stripe";

/**
 * 🧾 Webhook da Stripe
 */
export const stripeWebhook = async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET as string;

    if (!sig || !endpointSecret) {
      throw new Error("Assinatura ou segredo do webhook ausente.");
    }

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig as string,
      endpointSecret
    );

    switch (event.type) {
      case "payment_intent.succeeded":
        console.log("✅ Pagamento aprovado:", event.data.object["id"]);
        break;

      case "payment_intent.payment_failed":
        console.log("❌ Pagamento falhou:", event.data.object["id"]);
        break;

      default:
        console.log("ℹ️ Evento ignorado:", event.type);
    }

    res.status(200).send({ received: true });
  } catch (err: any) {
    console.error("Erro no webhook Stripe:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};
