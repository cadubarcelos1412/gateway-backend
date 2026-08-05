import { IAcquirer } from "./IAcquirer";
import { CreateTransactionDTO, CreateTransactionResult } from "./types";
import pagarme from "pagarme";

/**
 * 🏦 PagarmeAcquirer — Adapter para integração com a Pagar.me
 * - Implementa a interface IAcquirer.
 * - Cria transações reais com suporte a PIX, boleto e cartão.
 */
export class PagarmeAcquirer implements IAcquirer {
  async createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    if (!process.env.PAGARME_SECRET_KEY) {
      throw new Error("❌ PAGARME_SECRET_KEY não configurada no ambiente.");
    }

    const client = await pagarme.client.connect({
      api_key: process.env.PAGARME_SECRET_KEY,
    });

    const tx = await client.transactions.create({
      amount: Math.round(payload.amount * 100),
      payment_method: payload.method,
      capture: true,
      installments: 1,
      postback_url: payload.postbackUrl,
      customer: {
        external_id: payload.customer.document,
        name: payload.customer.name,
        email: payload.customer.email,
        type: payload.customer.document.length === 11 ? "individual" : "corporation",
        country: "br",
        documents: [
          {
            type: payload.customer.document.length === 11 ? "cpf" : "cnpj",
            number: payload.customer.document,
          },
        ],
        ...(payload.customer.phone
          ? { phone_numbers: [payload.customer.phone] }
          : {}),
      },
      metadata: {
        productId: payload.product.id,
        productName: payload.product.name,
        idempotencyKey: payload.idempotencyKey || "",
        ...(payload.metadata || {}),
      },
    });

    return {
      externalId: tx.id,
      postbackUrl: payload.postbackUrl,
      raw: tx,
    };
  }

  /**
   * Estorno total via SDK oficial da Pagar.me (`client.transactions.refund`,
   * POST /transactions/:id/refund — confirmado lendo node_modules/pagarme,
   * não documentação externa). Só estorno TOTAL: a Pagar.me aceita estorno
   * parcial via campo de valor, mas não implementamos aqui por não termos
   * confirmado o nome exato do campo na versão da API em uso — evita
   * inventar um contrato não verificado.
   */
  async refund(externalId: string): Promise<any> {
    if (!process.env.PAGARME_SECRET_KEY) {
      throw new Error("❌ PAGARME_SECRET_KEY não configurada no ambiente.");
    }

    const client = await pagarme.client.connect({
      api_key: process.env.PAGARME_SECRET_KEY,
    });

    return client.transactions.refund({ id: externalId });
  }
}
