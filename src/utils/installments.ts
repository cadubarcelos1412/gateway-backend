import { round } from "./fees";
import { IFeeTable } from "../models/feeTable.types";

export interface InstallmentOption {
  installments: number;
  /** O que o comprador paga no total, em reais. */
  buyerTotal: number;
  /** Valor de cada parcela, em reais. */
  perInstallment: number;
  /** O que o vendedor recebe líquido da taxa de cartão (antes de retenção de risco), em reais. */
  sellerNet: number;
}

export const MAX_PREVIEW_INSTALLMENTS = 12;

/**
 * Calcula as opções de parcelamento pro link de pagamento / checkout —
 * ANTES de saber a bandeira real do cartão (só é conhecida depois que a
 * Zendry processa a cobrança), usa o bucket "standard" da tabela do seller
 * como estimativa. A cobrança de verdade recalcula com a bandeira real
 * (ver transaction.service.ts) — pode haver diferença de centavos entre
 * esse preview e o valor final.
 *
 * "absorb": comprador paga sempre `basePrice`, vendedor recebe menos
 * conforme a taxa da parcela sobe (comportamento histórico do sistema).
 * "passOn": valor cobrado do comprador sobe (fórmula de "gross-up") pra
 * vendedor sempre receber `basePrice` cheio.
 */
export function computeInstallmentOptions(
  basePrice: number,
  feeMode: "absorb" | "passOn",
  feeTable: IFeeTable,
  maxInstallments: number = MAX_PREVIEW_INSTALLMENTS
): InstallmentOption[] {
  const options: InstallmentOption[] = [];

  for (let n = 1; n <= maxInstallments; n++) {
    const feePct = feeTable.cardFees.standard[String(n)] ?? feeTable.cardFees.standard["1"] ?? 0;

    const buyerTotal = feeMode === "passOn" ? round(basePrice / (1 - feePct / 100)) : round(basePrice);
    const sellerNet = feeMode === "passOn" ? round(basePrice) : round(basePrice - (basePrice * feePct) / 100);

    options.push({
      installments: n,
      buyerTotal,
      perInstallment: round(buyerTotal / n),
      sellerNet,
    });
  }

  return options;
}
