import { Request, Response } from "express";
import { getStripe } from "../config/stripe";

export const handleStripeWebhook = async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET as string;

    if (!sig || !endpointSecret) {
      res.status(400).send("Webhook signature missing.");
      return;
    }

    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    switch (event.type) {
      case "payment_intent.succeeded":
        console.log("✅ Pagamento bem-sucedido:", event.data.object["id"]);
        break;
      case "payment_intent.payment_failed":
        console.log("❌ Falha no pagamento:", event.data.object["id"]);
        break;
      default:
        console.log(`Evento ignorado: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Erro no webhook Stripe:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};
