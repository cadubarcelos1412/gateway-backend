// src/models/financialAudit.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IFinancialAudit extends Document {
  sellerId: mongoose.Types.ObjectId;
  action: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  amount?: number;
  reason?: string;
  performedBy?: string;
  createdAt: Date;
}

const FinancialAuditSchema = new Schema<IFinancialAudit>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    action: { type: String, required: true },
    oldValue: { type: Object },
    newValue: { type: Object },
    amount: { type: Number },
    reason: { type: String },
    performedBy: { type: String },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

export const FinancialAudit = mongoose.model<IFinancialAudit>(
  "FinancialAudit",
  FinancialAuditSchema
);
