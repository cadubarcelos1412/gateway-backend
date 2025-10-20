import mongoose, { Schema, Document, Model } from "mongoose";

export type PaymentMethod = "pix" | "credit_card" | "boleto";
export type RiskLevel = "low" | "medium" | "high";

export interface IRetentionPolicy extends Document {
  method: PaymentMethod;
  riskLevel: RiskLevel; // 🛡️ nível de risco do seller
  percentage: number; // % retido do valor líquido
  days: number; // dias de retenção
  description?: string; // 📝 motivo ou observação da política
  active: boolean; // ✅ permite ativar/desativar política sem apagar
  createdAt: Date;
  updatedAt: Date;
}

const RetentionPolicySchema = new Schema<IRetentionPolicy>(
  {
    method: {
      type: String,
      enum: ["pix", "credit_card", "boleto"],
      required: true,
      index: true,
    },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    days: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

/* 📊 Índices para performance e auditoria */
RetentionPolicySchema.index({ method: 1, riskLevel: 1 }, { unique: true });
RetentionPolicySchema.index({ active: 1 });

export const RetentionPolicy: Model<IRetentionPolicy> = mongoose.model<IRetentionPolicy>(
  "RetentionPolicy",
  RetentionPolicySchema
);
