import { sttartFetch } from "./client";

// Swap BRL -> USDT — POST /v1/api/quote (cotação) + POST
// /v1/api/quote/transactions/purchase-request (compra de verdade). Modelo
// bem diferente da Zendry: aqui não existe wallet-tesouro pré-financiada,
// cada saque é uma cotação+compra nova, usando o walletAddress que o
// seller informou. `quotationId` documentado como válido por ~60s — por
// isso quoteUsdt e purchaseUsdt em sequência, sem pausa no meio (sem retry
// nem chamada nenhuma entre as duas).

export interface SttartQuote {
  quotationId: string;
  /** Preço de 1 unidade da moeda base em BRL nessa cotação. */
  unitPrice: number;
  expiresAt: string;
}

/**
 * Cotação genérica BRL <- moeda (POST /v1/api/quote) — usada tanto pelo
 * swap USDT (quoteUsdt, abaixo) quanto pelo pedido de wire internacional
 * (ver wireCashout.service.ts). Wire usa ISSO SÓ PRA COTAR — nunca chama
 * purchaseUsdt nem nenhuma função de execução, porque não existe "comprar e
 * mandar" via API pra wire (é 100% manual do lado Sttart).
 */
export async function getQuote(baseCurrency: "USDT" | "USD" | "EUR"): Promise<SttartQuote> {
  const result = await sttartFetch<{
    unit_price: number;
    expires_at: string;
    quotationId: string;
  }>("/v1/api/quote", {
    method: "POST",
    body: { base_currency: baseCurrency, quote_currency: "BRL" },
  });
  return { quotationId: result.quotationId, unitPrice: result.unit_price, expiresAt: result.expires_at };
}

/** @deprecated usa nome antigo — mantido só como wrapper de compatibilidade, ver getQuote. */
export async function quoteUsdt(): Promise<SttartQuote> {
  return getQuote("USDT");
}

export interface PurchaseUsdtInput {
  quotationId: string;
  /** Quantidade de USDT a comprar/enviar (já convertida a partir do BRL líquido). */
  quantity: number;
  destinationAddress: string;
}

export interface PurchaseUsdtResult {
  referenceCode: string;
  status: string;
}

export async function purchaseUsdt(input: PurchaseUsdtInput): Promise<PurchaseUsdtResult> {
  const result = await sttartFetch<{ id: string; status: string }>(
    "/v1/api/quote/transactions/purchase-request",
    {
      method: "POST",
      body: {
        quotationId: input.quotationId,
        currency: "USDT",
        quantity: input.quantity,
        walletAddress: input.destinationAddress,
      },
    }
  );
  return { referenceCode: result.id, status: result.status };
}
