import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * 💳 Status possíveis do Cashout
 * - pending: criado e aguardando aprovação
 * - approved: aprovado e em processo de liquidação
 * - rejected: rejeitado manualmente
 * - completed: liquidação bancária confirmada
 */
export type CashoutStatus = "pending" | "approved" | "rejected" | "completed";

/**
 * 🧾 Interface da Solicitação de Saque
 */
export interface ICashoutRequest extends Document {
  userId: Types.ObjectId;
  amount: number;
  status: CashoutStatus;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 🧱 Schema Mongoose
 */
const CashoutRequestSchema = new Schema<ICashoutRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0.01 },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
      required: true,
    },

    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
  },
  { timestamps: true }
);

/**
 * ⚙️ Índices estratégicos
 * - Busca rápida por usuário e status
 * - Ordenação por data de criação (últimos primeiro)
 */
CashoutRequestSchema.index({ userId: 1, status: 1 });
CashoutRequestSchema.index({ createdAt: -1 });

/**
 * ✅ Export default (compatível com import CashoutRequest from ...)
 */
const CashoutRequest = mongoose.model<ICashoutRequest>(
  "CashoutRequest",
  CashoutRequestSchema
);

export default CashoutRequest;
