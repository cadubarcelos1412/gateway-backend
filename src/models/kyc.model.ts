import mongoose, { Schema, Document, Types } from "mongoose";

export type KycStatus = "pending" | "under_review" | "approved" | "rejected" | "active";

export interface IKyc extends Document {
  sellerId: Types.ObjectId;
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  status: KycStatus;
  reason?: string;
}

const KycSchema = new Schema<IKyc>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    submittedAt: { type: Date, default: () => new Date() },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected", "active"],
      default: "pending",
      index: true,
    },
    reason: { type: String, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const Kyc = mongoose.model<IKyc>("Kyc", KycSchema);
