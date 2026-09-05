// src/models/feeTable.types.ts
// Tipo compartilhado da tabela de taxas — usado tanto pela config global
// (SystemFeeConfig) quanto pelo override individual (Seller.feeTable).

export type CardBrand = "amex" | "elo" | "mastercard" | "visa" | "standard";

export type CardInstallmentFees = Record<string, number>; // "1".."14" -> percentual

export interface IFeeTable {
  pixIn: { percentage: number };
  pixOut: { percentage: number; fixed: number };
  /** Taxa do saque em USDT via Zendry — aplicada sobre o valor BASE em BRL, antes da conversão. */
  usdtOut: { percentage: number; fixed: number };
  /** Taxa do wire internacional via Sttart — aplicada sobre o valor BASE em BRL (custo real da
   * compra da moeda estrangeira), NÃO sobre o valor em moeda estrangeira. Não varia com câmbio —
   * ver wireCashout.service.ts. Valor inicial é placeholder, confirmar com o produto antes do
   * primeiro wire real (mesma disciplina de toda taxa nova nesse projeto). */
  wireOut: { percentage: number; fixed: number };
  settlementDays: number;
  cardFees: Record<CardBrand, CardInstallmentFees>;
  anticipation: {
    day15: { extraPercentage: number };
    day2: { extraPercentage: number };
  };
}

// Taxa única de cartão, igual pra qualquer bandeira — mantém os 5 buckets
// internos (amex/elo/mastercard/visa/standard) só porque o resto do código
// resolve a taxa real pela bandeira detectada na transação (ver
// transaction.service.ts); todos apontam pro mesmo valor.
// Tabela atualizada em 2026-09-05 (pedido direto do produto).
const CARD_FEES: CardInstallmentFees = {
  "1": 10.13, "2": 13.52, "3": 16.50, "4": 19.49, "5": 22.48, "6": 25.48, "7": 28.84,
  "8": 31.86, "9": 34.87, "10": 37.90, "11": 40.93, "12": 43.97, "13": 47.51, "14": 50.56,
  "15": 53.62, "16": 56.69, "17": 59.76, "18": 62.84, "19": 65.93, "20": 69.02, "21": 72.12,
};

export const DEFAULT_FEE_TABLE: IFeeTable = {
  pixIn: { percentage: 2.89 },
  pixOut: { percentage: 1.99, fixed: 0 },
  usdtOut: { percentage: 2.5, fixed: 0 },
  wireOut: { percentage: 2.5, fixed: 0 },
  settlementDays: 30,
  cardFees: {
    amex: { ...CARD_FEES },
    elo: { ...CARD_FEES },
    mastercard: { ...CARD_FEES },
    visa: { ...CARD_FEES },
    standard: { ...CARD_FEES },
  },
  anticipation: {
    day15: { extraPercentage: 10 },
    day2: { extraPercentage: 25 },
  },
};

/** Normaliza a string de bandeira que a adquirente devolve pros 5 buckets da tabela. */
export function normalizeCardBrand(rawBrand: string | undefined | null): CardBrand {
  const b = (rawBrand || "").toLowerCase();
  if (b.includes("amex") || b.includes("american")) return "amex";
  if (b.includes("elo")) return "elo";
  if (b.includes("master")) return "mastercard";
  if (b.includes("visa")) return "visa";
  return "standard";
}
