// src/models/splitRule.model.ts
// Parceria de split entre sellers: percentual do netAmount do seller pagador
// que é roteado automaticamente pro seller destinatário em toda venda futura.
import mongoose, { Schema, Document, Types } from "mongoose";

export type SplitRuleStatus = "active" | "revoked";

export interface ISplitRule extends Document {
  payingSellerId: Types.ObjectId;
  recipientSellerId: Types.ObjectId;
  recipientEmail: string; // snapshot pra exibição/histórico — a fonte de verdade é recipientSellerId
  percentage: number;
  description?: string;
  status: SplitRuleStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SplitRuleSchema = new Schema<ISplitRule>(
  {
    payingSellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    recipientSellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    recipientEmail: { type: String, required: true, trim: true, lowercase: true },
    percentage: { type: Number, required: true, min: 0.01, max: 100 },
    description: { type: String, trim: true },
    status: { type: String, enum: ["active", "revoked"], default: "active", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false }
);

SplitRuleSchema.index({ payingSellerId: 1, status: 1 });

export const SplitRule = mongoose.model<ISplitRule>("SplitRule", SplitRuleSchema);
