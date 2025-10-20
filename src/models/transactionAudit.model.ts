import mongoose, { Schema, Document, Types } from "mongoose";

export type RiskFlag =
  | "NO_KYC"
  | "HIGH_AMOUNT"
  | "SUSPICIOUS_IP"
  | "FAILED_ATTEMPT"
  | "UNKNOWN_DEVICE"
  | "FOREIGN_IP"
  | "BUYER_EQUALS_SELLER";

export type AuditStatus = "pending" | "approved" | "failed" | "blocked";
export type AuditMethod = "pix" | "credit_card" | "boleto";

export interface ITransactionAudit extends Document {
  transactionId?: Types.ObjectId;
  sellerId: Types.ObjectId;
  userId: Types.ObjectId;

  amount: number;
  method: AuditMethod;
  status: AuditStatus;
  description?: string;

  kycStatus: string;
  ipAddress?: string;
  userAgent?: string;

  buyerDocument?: string;
  geoCountry?: string;
  geoCity?: string;
  asn?: string;

  attemptCount?: number;
  flags: RiskFlag[];
  createdAt: Date;
}

const TransactionAuditSchema = new Schema<ITransactionAudit>(
  {
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    amount: { type: Number, required: true },
    method: { type: String, enum: ["pix", "credit_card", "boleto"], required: true },
    status: { type: String, enum: ["pending", "approved", "failed", "blocked"], required: true },
    description: { type: String },

    kycStatus: { type: String, required: true },

    ipAddress: { type: String },
    userAgent: { type: String },

    buyerDocument: { type: String, trim: true },
    geoCountry: { type: String, trim: true },
    geoCity: { type: String, trim: true },
    asn: { type: String, trim: true },

    attemptCount: { type: Number, default: 1, min: 1 },

    flags: [
      {
        type: String,
        enum: [
          "NO_KYC",
          "HIGH_AMOUNT",
          "SUSPICIOUS_IP",
          "FAILED_ATTEMPT",
          "UNKNOWN_DEVICE",
          "FOREIGN_IP",
          "BUYER_EQUALS_SELLER",
        ],
      },
    ],

    createdAt: { type: Date, default: () => new Date(), immutable: true },
  },
  { versionKey: false }
);

/* 📊 Índices estratégicos */
TransactionAuditSchema.index({ sellerId: 1, createdAt: -1 });
TransactionAuditSchema.index({ flags: 1 });
TransactionAuditSchema.index({ ipAddress: 1 });
TransactionAuditSchema.index({ buyerDocument: 1 });

export const TransactionAudit = mongoose.model<ITransactionAudit>(
  "TransactionAudit",
  TransactionAuditSchema
);
