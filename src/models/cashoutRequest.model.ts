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

  /** Trilho do saque — "pix" (padrão, fluxo manual existente) ou "usdt" (Zendry, automático). */
  rail: "pix" | "usdt";
  /** Endereço USDT de destino informado pelo seller — só existe quando rail === "usdt". */
  destinationAddress?: string;
  /** Rede da carteira (ex.: "trc20") — não confirmada com a Zendry, ver ZENDRY-MIGRATION.md. */
  network?: string;
  /** Cotação BRL/USDT no momento do saque — snapshot pra auditoria/disputa. */
  quotedBrlPrice?: number;
  /** Valor em USDT efetivamente enviado. */
  usdtAmount?: number;
  fee?: number;
  netAmount?: number;
  /** reference_code devolvido pela Zendry — usado se algum dia existir consulta/webhook de status. */
  externalReference?: string;
  /** status bruto devolvido pela Zendry (ex.: "pending") — não sabemos os valores possíveis além desse. */
  providerStatus?: string;

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

    rail: { type: String, enum: ["pix", "usdt"], default: "pix", required: true },
    destinationAddress: { type: String, trim: true },
    network: { type: String, trim: true },
    quotedBrlPrice: { type: Number },
    usdtAmount: { type: Number },
    fee: { type: Number },
    netAmount: { type: Number },
    externalReference: { type: String, index: true },
    providerStatus: { type: String },
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
