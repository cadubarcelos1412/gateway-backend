// src/models/splitRule.model.ts
// Parceria de split entre sellers: percentual do netAmount do seller pagador
// que é roteado automaticamente pro seller destinatário em toda venda futura.
import mongoose, { Schema, Document, Types } from "mongoose";

// pending: convite criado, aguardando o destinatário aceitar ou recusar —
// só entra no split de vendas de verdade quando vira "active".
export type SplitRuleStatus = "pending" | "active" | "revoked" | "rejected";

export interface ISplitRule extends Document {
  payingSellerId: Types.ObjectId;
  recipientSellerId: Types.ObjectId;
  recipientEmail: string; // snapshot pra exibição/histórico — a fonte de verdade é recipientSellerId
  percentage: number;
  /** Percentual proposto pelo pagador pra substituir `percentage` — parceria
   * continua ativa no valor atual até o destinatário aceitar ou recusar. */
  pendingPercentage?: number;
  description?: string;
  status: SplitRuleStatus;
  createdBy: Types.ObjectId;
  /** Quando setado, alguém pediu revogação — a parceria continua "active"
   * (splits continuam valendo) até essa data, depois disso o sweep periódico
   * (ver revokeMaturedSplitRules em splitRule.service.ts) muda o status pra
   * "revoked" de verdade. Carência de 15 dias, decisão de negócio de
   * 2026-08-18: revogar sempre foi imediato e sem aviso nenhum pro
   * destinatário — agora sempre manda e-mail e dá um prazo antes de parar
   * de valer. */
  revokeEffectiveAt?: Date;
  revokeRequestedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SplitRuleSchema = new Schema<ISplitRule>(
  {
    payingSellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    recipientSellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    recipientEmail: { type: String, required: true, trim: true, lowercase: true },
    percentage: { type: Number, required: true, min: 0.01, max: 100 },
    pendingPercentage: { type: Number, min: 0.01, max: 100 },
    description: { type: String, trim: true },
    status: { type: String, enum: ["pending", "active", "revoked", "rejected"], default: "pending", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    revokeEffectiveAt: { type: Date },
    revokeRequestedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false }
);

SplitRuleSchema.index({ payingSellerId: 1, status: 1 });

export const SplitRule = mongoose.model<ISplitRule>("SplitRule", SplitRuleSchema);
