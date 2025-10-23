import { IAcquirer } from "./IAcquirer";
import { CreateTransactionDTO, CreateTransactionResult } from "./types";
import { stripe } from "../config/stripe";

/**
 * 🏦 StripeAcquirer — Adapter para integração com a Stripe
 * - Implementa a interface IAcquirer para padronizar o comportamento.
 * - Responsável por criar intents de pagamento.
 * - Recomendado para cartões de crédito e PIX (via PaymentIntent).
 */
export class StripeAcquirer implements IAcquirer {
  async createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("❌ STRIPE_SECRET_KEY não configurada no ambiente.");
    }

    // ⚠️ Stripe exige valor em centavos
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(payload.amount * 100),
      currency: payload.currency,
      description: payload.description,
      receipt_email: payload.customer.email,
      automatic_payment_methods: { enabled: true },
      metadata: {
        productId: payload.product.id,
        productName: payload.product.name,
        idempotencyKey: payload.idempotencyKey || "",
        customerDocument: payload.customer.document,
        ...(payload.metadata || {}),
      },
    });

    return {
      externalId: intent.id,
      // Stripe não usa postback tradicional — webhook próprio
      postbackUrl: undefined,
      raw: intent,
    };
  }
}
