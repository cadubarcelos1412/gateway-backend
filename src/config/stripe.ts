// src/config/stripe.ts
import Stripe from "stripe";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY as string;
if (!STRIPE_SECRET) {
  throw new Error("❌ STRIPE_SECRET_KEY não configurada no .env");
}

// ⚡️ Sem definir apiVersion manualmente (evita erros de tipagem)
export const stripe = new Stripe(STRIPE_SECRET);

export const createStripePaymentIntent = async (payload: {
  amount: number;
  currency: string;
  customer: { name: string; email: string };
  metadata?: Record<string, any>;
}) => {
  return await stripe.paymentIntents.create({
    amount: Math.round(payload.amount * 100), // centavos
    currency: payload.currency,
    description: payload.metadata?.description || "Venda via Kissa",
    metadata: payload.metadata,
    automatic_payment_methods: { enabled: true },
    receipt_email: payload.customer.email,
  });
};

export const captureStripePayment = async (paymentIntentId: string) => {
  return await stripe.paymentIntents.capture(paymentIntentId);
};
