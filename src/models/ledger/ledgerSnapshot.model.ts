import mongoose, { Schema, Document } from "mongoose";

export interface LedgerSnapshotDocument extends Document {
  dateKey: string; // ex: 2025-10-21
  sellerId?: mongoose.Types.ObjectId;
  account: string;
  balance: number;
  debitTotal: number;
  creditTotal: number;
  divergence?: number;
  locked?: boolean;
  createdAt: Date;
}

const LedgerSnapshotSchema = new Schema<LedgerSnapshotDocument>({
  dateKey: { type: String, required: true },
  sellerId: { type: Schema.Types.ObjectId, ref: "Seller" },
  account: { type: String, required: true },
  balance: { type: Number, required: true },
  debitTotal: { type: Number, required: true },
  creditTotal: { type: Number, required: true },
  divergence: { type: Number, default: 0 },
  locked: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date(), immutable: true },
});

LedgerSnapshotSchema.index({ dateKey: 1, account: 1, sellerId: 1 }, { unique: true });

const LedgerSnapshotModel = mongoose.model<LedgerSnapshotDocument>(
  "LedgerSnapshot",
  LedgerSnapshotSchema
);

export default LedgerSnapshotModel;
