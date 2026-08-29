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
const CARD_FEES: CardInstallmentFees = {
  "1": 8.85, "2": 10.15, "3": 10.84, "4": 11.54, "5": 12.24, "6": 12.95, "7": 13.86,
  "8": 14.59, "9": 15.31, "10": 16.05, "11": 16.79, "12": 17.54, "13": 18.29, "14": 19.05,
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
