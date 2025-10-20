// src/models/subaccount.model.ts
import { Schema, model, Document } from "mongoose";

export interface ISubaccount extends Document {
  sellerId: Schema.Types.ObjectId;         // 🔗 vínculo com o seller
  balance: {
    available: number;                     // 💸 saldo disponível para saque
    retained: number;                      // 🔒 saldo retido por políticas
    total: number;                         // 📊 total geral (available + retained)
  };
  settlementConfig: {
    method: "manual" | "auto";             // método de liquidação (por enquanto: manual)
    minPayout: number;                     // valor mínimo de saque
  };
  createdAt: Date;
  updatedAt: Date;
}

const SubaccountSchema = new Schema<ISubaccount>(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      unique: true, // cada seller tem apenas UMA subconta
      index: true,
    },
    balance: {
      available: { type: Number, default: 0 },
      retained: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    settlementConfig: {
      method: { type: String, enum: ["manual", "auto"], default: "manual" },
      minPayout: { type: Number, default: 100 },
    },
  },
  { timestamps: true, versionKey: false }
);

export const Subaccount = model<ISubaccount>("Subaccount", SubaccountSchema);
