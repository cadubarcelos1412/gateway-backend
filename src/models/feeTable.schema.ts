// src/models/feeTable.schema.ts
// Schema Mongoose de IFeeTable, compartilhado entre SystemFeeConfig (config global)
// e Seller.feeTable (override individual) — mesma forma nos dois lugares.
import { Schema } from "mongoose";
import { IFeeTable } from "./feeTable.types";

const CardInstallmentFeesSchema = new Schema(
  {
    "1": Number, "2": Number, "3": Number, "4": Number, "5": Number, "6": Number, "7": Number,
    "8": Number, "9": Number, "10": Number, "11": Number, "12": Number, "13": Number, "14": Number,
  },
  { _id: false }
);

export const FeeTableSchema = new Schema<IFeeTable>(
  {
    pixIn: { percentage: { type: Number, required: true } },
    pixOut: {
      percentage: { type: Number, required: true },
      fixed: { type: Number, required: true, default: 0 },
    },
    settlementDays: { type: Number, required: true, default: 30 },
    cardFees: {
      amex: { type: CardInstallmentFeesSchema, required: true },
      elo: { type: CardInstallmentFeesSchema, required: true },
      mastercard: { type: CardInstallmentFeesSchema, required: true },
      visa: { type: CardInstallmentFeesSchema, required: true },
      standard: { type: CardInstallmentFeesSchema, required: true },
    },
    anticipation: {
      day15: { extraPercentage: { type: Number, required: true, default: 10 } },
      day2: { extraPercentage: { type: Number, required: true, default: 25 } },
    },
  },
  { _id: false }
);
