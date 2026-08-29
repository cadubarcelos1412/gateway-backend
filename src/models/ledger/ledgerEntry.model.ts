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
  // Não é unique aqui: um batch de dupla-entrada grava 2+ linhas (débito e
  // crédito) compartilhando de propósito o MESMO idempotencyKey — a garantia
  // de não duplicar o BATCH inteiro já vem do índice único (batchId, sequence)
  // abaixo, mais o findOne(idempotencyKey) que o ledger.service.ts faz antes
  // de inserir. Um unique aqui rejeitava a segunda linha de todo batch.
  idempotencyKey: { type: String, required: true },
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
// 🔒 Achado em auditoria de segurança (2026-08-30): o findOne(idempotencyKey)
// em ledger.service.ts, sozinho, só protege contra retry SEQUENCIAL (ex.:
// webhook reenviado depois que o primeiro já commitou) — duas chamadas
// verdadeiramente CONCORRENTES (ex.: duplo-clique em "aprovar saque", ou uma
// condição de corrida em createCashout) podem ambas passar o findOne antes
// de qualquer uma commitar, e ambas inserir. `batchId` não ajuda aqui (é
// gerado novo a cada chamada). Este índice único em (idempotencyKey,
// sequence) faz a SEGUNDA inserção concorrente colidir de verdade no banco
// (E11000), abortando a transação duplicada em vez de duplicar o lançamento.
LedgerEntrySchema.index({ idempotencyKey: 1, sequence: 1 }, { unique: true });

export default mongoose.model<LedgerEntry>('LedgerEntry', LedgerEntrySchema);
