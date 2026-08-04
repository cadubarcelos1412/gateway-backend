// src/models/idempotencyRecord.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IIdempotencyRecord extends Document {
  merchantId: Types.ObjectId;
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
}

const IdempotencyRecordSchema = new Schema<IIdempotencyRecord>({
  merchantId: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
  idempotencyKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  responseStatus: { type: Number, required: true },
  responseBody: { type: Schema.Types.Mixed },
  // TTL de 24h — o registro expira sozinho, sem job de limpeza manual.
  createdAt: { type: Date, default: Date.now, expires: "24h" },
});

IdempotencyRecordSchema.index({ merchantId: 1, idempotencyKey: 1 }, { unique: true });

export const IdempotencyRecord = mongoose.model<IIdempotencyRecord>("IdempotencyRecord", IdempotencyRecordSchema);
