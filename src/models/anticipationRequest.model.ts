// src/models/anticipationRequest.model.ts
// Histórico/auditoria de antecipações executadas — a mutação de saldo em si
// vive no Wallet, isso aqui é só o registro de cada operação.
import mongoose, { Schema, Document, Types } from "mongoose";

export type AnticipationTier = "day15" | "day2";

export interface IAnticipationRequest extends Document {
  userId: Types.ObjectId;
  sellerId: Types.ObjectId;
  originalAmount: number;
  tier: AnticipationTier;
  extraFeePercentage: number;
  extraFeeAmount: number;
  payoutAmount: number;
  originalAvailableIn: Date;
  createdAt: Date;
}

const AnticipationRequestSchema = new Schema<IAnticipationRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    originalAmount: { type: Number, required: true },
    tier: { type: String, enum: ["day15", "day2"], required: true },
    extraFeePercentage: { type: Number, required: true },
    extraFeeAmount: { type: Number, required: true },
    payoutAmount: { type: Number, required: true },
    originalAvailableIn: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

export const AnticipationRequest = mongoose.model<IAnticipationRequest>(
  "AnticipationRequest",
  AnticipationRequestSchema
);
