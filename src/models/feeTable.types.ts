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
// Tabela corrigida em 2026-09-05 (a de antes no mesmo dia estava errada).
const CARD_FEES: CardInstallmentFees = {
  "1": 10.13, "2": 11.23, "3": 11.92, "4": 12.62, "5": 13.32, "6": 14.03, "7": 15.10,
  "8": 15.83, "9": 16.55, "10": 17.29, "11": 18.03, "12": 18.78, "13": 20.03, "14": 20.79,
  "15": 21.56, "16": 22.34, "17": 23.12, "18": 23.91, "19": 24.71, "20": 25.51, "21": 26.32,
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
