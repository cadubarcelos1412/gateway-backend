import mongoose, { Schema, Document } from "mongoose";

export interface IRiskPolicy extends Document {
  sellerId: mongoose.Types.ObjectId;
  reservePercentage: number; // Ex: 0.05 = 5%
  minReserveDays: number; // Ex: 30 dias
  autoRelease: boolean; // Se true, libera automaticamente via cron
  lastUpdated: Date;
}

const RiskPolicySchema = new Schema<IRiskPolicy>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reservePercentage: { type: Number, default: 0.05 },
    minReserveDays: { type: Number, default: 30 },
    autoRelease: { type: Boolean, default: true },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

RiskPolicySchema.index({ sellerId: 1 });

export const RiskPolicy = mongoose.model<IRiskPolicy>("RiskPolicy", RiskPolicySchema);
