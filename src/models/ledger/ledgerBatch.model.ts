import mongoose, { Schema, Document } from "mongoose";

export interface LedgerBatch extends Document {
  dateKey: string; // ex: 2025-10-21
  batchId: mongoose.Types.ObjectId;
  totalEntries: number;
  totalDebit: number;
  totalCredit: number;
  closed: boolean;
  createdAt: Date;
  closedAt?: Date;
}

const LedgerBatchSchema = new Schema<LedgerBatch>({
  dateKey: { type: String, required: true },
  batchId: { type: Schema.Types.ObjectId, required: true, unique: true },
  totalEntries: { type: Number, required: true },
  totalDebit: { type: Number, required: true },
  totalCredit: { type: Number, required: true },
  closed: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date(), immutable: true },
  closedAt: { type: Date },
});

LedgerBatchSchema.index({ dateKey: 1 }, { unique: true });

export default mongoose.model<LedgerBatch>("LedgerBatch", LedgerBatchSchema);
