// src/models/feeTable.types.ts
// Tipo compartilhado da tabela de taxas — usado tanto pela config global
// (SystemFeeConfig) quanto pelo override individual (Seller.feeTable).

export type CardBrand = "amex" | "elo" | "mastercard" | "visa" | "standard";

export type CardInstallmentFees = Record<string, number>; // "1".."14" -> percentual

export interface IFeeTable {
  pixIn: { percentage: number };
  pixOut: { percentage: number; fixed: number };
  settlementDays: number;
  cardFees: Record<CardBrand, CardInstallmentFees>;
  anticipation: {
    day15: { extraPercentage: number };
    day2: { extraPercentage: number };
  };
}

// Tabela de referência enviada pelo usuário (taxas reais da plataforma).
const AMEX: CardInstallmentFees = {
  "1": 7.34, "2": 8.24, "3": 8.93, "4": 9.63, "5": 10.33, "6": 11.04, "7": 11.90,
  "8": 12.63, "9": 13.35, "10": 14.09, "11": 14.83, "12": 15.58, "13": 16.33, "14": 17.09,
};
const ELO: CardInstallmentFees = {
  "1": 7.21, "2": 8.44, "3": 9.13, "4": 9.83, "5": 10.53, "6": 11.24, "7": 12.31,
  "8": 13.04, "9": 13.76, "10": 14.50, "11": 15.24, "12": 15.99, "13": 16.74, "14": 17.50,
};
const MASTERCARD: CardInstallmentFees = {
  "1": 6.85, "2": 8.15, "3": 8.84, "4": 9.54, "5": 10.24, "6": 10.95, "7": 11.86,
  "8": 12.59, "9": 13.31, "10": 14.05, "11": 14.79, "12": 15.54, "13": 16.29, "14": 17.05,
};
const VISA: CardInstallmentFees = {
  "1": 6.92, "2": 7.77, "3": 8.46, "4": 9.16, "5": 9.86, "6": 10.57, "7": 11.61,
  "8": 12.34, "9": 13.06, "10": 13.80, "11": 14.54, "12": 15.29, "13": 16.04, "14": 16.80,
};
// "Bandeiras padrão" — mesma tabela do Mastercard na referência enviada.
const STANDARD: CardInstallmentFees = { ...MASTERCARD };

export const DEFAULT_FEE_TABLE: IFeeTable = {
  pixIn: { percentage: 2.89 },
  pixOut: { percentage: 1.99, fixed: 0 },
  settlementDays: 30,
  cardFees: {
    amex: AMEX,
    elo: ELO,
    mastercard: MASTERCARD,
    visa: VISA,
    standard: STANDARD,
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
