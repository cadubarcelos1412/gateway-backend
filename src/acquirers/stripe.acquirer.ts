// src/acquirers/stripe.acquirer.ts
import { getStripe } from "../config/stripe";
import { IAcquirer } from "./IAcquirer";
import { CreateTransactionDTO, CreateTransactionResult } from "./types";

/**
 * 💳 StripeAcquirer — implementação do IAcquirer
 */
export class StripeAcquirer implements IAcquirer {
  async createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    const stripe = getStripe();

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(payload.amount * 100),
      currency: payload.currency || "brl",
      description: payload.description || "Venda via Kissa",
      metadata: payload.metadata,
      automatic_payment_methods: { enabled: true },
      receipt_email: payload.customer.email,
    });

    return {
      externalId: intent.id,
      acquirer: "stripe",
      status:
        intent.status === "succeeded"
          ? "approved"
          : intent.status === "requires_payment_method"
          ? "failed"
          : "pending",
      rawResponse: intent,
    };
  }
}
