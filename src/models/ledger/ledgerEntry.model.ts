// src/models/ledger/ledgerEntry.model.ts
import mongoose, { Schema, Document } from 'mongoose';
import { createHash } from 'crypto';

export type LedgerEntryType = 'debit' | 'credit';

export interface LedgerEntry extends Document {
  transactionId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  batchId: mongoose.Types.ObjectId;
  sequence: number;
  account: string;
  type: LedgerEntryType;
  amount: number;
  currency: 'BRL';
  sideHash: string;
  idempotencyKey: string;
  source: { system: string; acquirer?: string; ip?: string };
  createdAt: Date;
  eventAt?: Date;
}

const LedgerEntrySchema = new Schema<LedgerEntry>({
  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
  sellerId: { type: Schema.Types.ObjectId, required: true },
  batchId: { type: Schema.Types.ObjectId, required: true },
  sequence: { type: Number, required: true },
  account: { type: String, required: true },
  type: { type: String, enum: ['debit', 'credit'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'BRL' },
  sideHash: { type: String, required: true },
  idempotencyKey: { type: String, required: true, unique: true },
  source: {
    system: { type: String, required: true },
    acquirer: { type: String },
    ip: { type: String }
  },
  createdAt: { type: Date, default: () => new Date(), immutable: true },
  eventAt: { type: Date }
});

// Indexes
LedgerEntrySchema.index({ sellerId: 1, account: 1, createdAt: 1 });
LedgerEntrySchema.index({ transactionId: 1 });
LedgerEntrySchema.index({ batchId: 1, sequence: 1 }, { unique: true });
LedgerEntrySchema.index({ idempotencyKey: 1 }, { unique: true });

export default mongoose.model<LedgerEntry>('LedgerEntry', LedgerEntrySchema);
