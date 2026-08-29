import { IAcquirer } from "./IAcquirer";
import {
  CreateTransactionDTO,
  CreateTransactionResult,
  SendPayoutInput,
  SendPayoutResult,
  PayoutStatusResult,
  SwapInput,
  SwapResult,
} from "./types";
import { createDynamicPix } from "../lib/sttart/pix";
import { sendPayout, getPayoutStatus } from "../lib/sttart/payout";
import { quoteUsdt, purchaseUsdt } from "../lib/sttart/crypto";
import crypto from "crypto";

/**
 * 🏦 SttartAcquirer — Adapter para a Sttart (contrato assinado 2026-08-18,
 * Pix in/out 0%, swap USDT 1%). Sem sandbox confirmado ainda — mesma
 * desconfiança já aplicada à Zendry: primeira validação real vai ser com
 * dinheiro de verdade em valor baixo.
 *
 * Só cobre Pix (cash-in + cash-out) e swap USDT — TED existe na API da
 * Sttart mas não tem fluxo/UI nosso pra chave bancária ainda.
 */
export class SttartAcquirer implements IAcquirer {
  async createTransaction(payload: CreateTransactionDTO): Promise<CreateTransactionResult> {
    if (payload.method !== "pix") {
      throw new Error(`Sttart não suporta o método de pagamento "${payload.method}".`);
    }

    const externalReference = payload.idempotencyKey || crypto.randomUUID();

    let result;
    try {
      result = await createDynamicPix({
        amountBRL: payload.amount,
        payerName: payload.customer.name,
        payerDocument: payload.customer.document,
        externalReference,
        expirationSeconds: 1800,
      });
    } catch (err) {
      console.error("❌ Sttart (pix) falhou:", err);
      const message = err instanceof Error ? err.message : "Erro ao criar cobrança Pix na Sttart.";
      throw new Error(message);
    }

    return {
      externalId: result.referenceCode,
      postbackUrl: payload.postbackUrl,
      paymentDetails: {
        pixCode: result.pixCode,
        pixQrCodeBase64: result.qrCodeBase64,
      },
    };
  }

  async sendPayout(input: SendPayoutInput): Promise<SendPayoutResult> {
    const result = await sendPayout({
      idempotentId: input.idempotentId,
      pixKeyType: input.pixKeyType,
      pixKey: input.pixKey,
      receiverName: input.receiverName,
      receiverDocument: input.receiverDocument,
      valueCents: input.valueCents,
    });
    return { externalReference: result.externalReference, status: result.status };
  }

  async getPayoutStatus(externalReference: string): Promise<PayoutStatusResult> {
    const result = await getPayoutStatus(externalReference);
    return { externalReference: result.externalReference, status: result.status };
  }

  /**
   * Diferente da Zendry (wallet-tesouro pré-financiada) — a Sttart cota e
   * compra USDT de verdade a cada saque. `quotationId` vale ~60s, então
   * cotação e compra acontecem em sequência, sem chamada nenhuma no meio.
   */
  async swapToStablecoin(input: SwapInput): Promise<SwapResult> {
    const quote = await quoteUsdt();
    const usdtAmount = Math.round((input.netAmountBRL / quote.unitPrice) * 100) / 100;

    const result = await purchaseUsdt({
      quotationId: quote.quotationId,
      quantity: usdtAmount,
      destinationAddress: input.destinationAddress,
    });

    return {
      externalReference: result.referenceCode,
      status: result.status,
      usdtAmount,
      quotedBrlPrice: quote.unitPrice,
    };
  }
}
