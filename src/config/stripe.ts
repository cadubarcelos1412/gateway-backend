// src/config/stripe.ts
import Stripe from "stripe";

/**
 * ✅ Inicializa Stripe de forma segura e tolerante a falhas.
 */
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY as string | undefined;

let stripe: Stripe | null = null;

if (!STRIPE_SECRET) {
  const msg = "⚠️ STRIPE_SECRET_KEY não configurada — Stripe desativado neste ambiente.";

  if (process.env.NODE_ENV === "production") {
    throw new Error(`❌ ${msg}`);
  } else {
    console.warn(msg);
  }
} else {
  stripe = new Stripe(STRIPE_SECRET, {
    apiVersion: "2022-11-15" as any, // 👈 força o tipo
  });
}

/**
 * Helper para garantir que o Stripe está inicializado
 */
export function getStripe(): Stripe {
  if (!stripe) {
    throw new Error("⚠️ Stripe não inicializado neste ambiente.");
  }
  return stripe;
}

/**
 * 🧾 Cria um pagamento (Payment Intent)
 */
export const createStripePaymentIntent = async (payload: {
  amount: number;
  currency: string;
  customer: { name: string; email: string };
  metadata?: Record<string, any>;
}) => {
  const s = getStripe();

  return await s.paymentIntents.create({
    amount: Math.round(payload.amount * 100),
    currency: payload.currency,
    description: payload.metadata?.description || "Venda via Kissa",
    metadata: payload.metadata,
    automatic_payment_methods: { enabled: true },
    receipt_email: payload.customer.email,
  });
};

/**
 * 💰 Captura um pagamento pendente
 */
export const captureStripePayment = async (paymentIntentId: string) => {
  const s = getStripe();
  return await s.paymentIntents.capture(paymentIntentId);
};

export { stripe };
