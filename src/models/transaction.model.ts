import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITransaction extends Document {
  sellerId: Types.ObjectId;
  userId?: Types.ObjectId;
  productId?: Types.ObjectId;
  externalId?: string;
  amount: number;
  netAmount?: number;
  fee?: number;
  method: "pix" | "credit_card" | "boleto";
  status: "pending" | "approved" | "failed" | "refunded";
  description?: string;
  flags?: string[];
  metadata?: { ipAddress?: string; deviceId?: string };

  purchaseData?: {
    products?: {
      id?: string;
      name?: string;
      price?: number;
      quantity?: number;
    }[];
    customer?: {
      name?: string;
      email?: string;
      document?: string;
      phone?: string;
      ip?: string;
    };
  };

  trackingParameters?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    externalId: { type: String },
    amount: { type: Number, required: true },
    netAmount: { type: Number },
    fee: { type: Number },
    method: { type: String, enum: ["pix", "credit_card", "boleto"], required: true },
    status: { type: String, enum: ["pending", "approved", "failed", "refunded"], default: "pending" },
    description: { type: String, trim: true },
    flags: [{ type: String, trim: true }],
    metadata: {
      ipAddress: { type: String },
      deviceId: { type: String },
    },
    purchaseData: {
      products: [
        {
          id: String,
          name: String,
          price: Number,
          quantity: Number,
        },
      ],
      customer: {
        name: String,
        email: String,
        document: String,
        phone: String,
        ip: String,
      },
    },
    trackingParameters: {
      utm_source: String,
      utm_medium: String,
      utm_campaign: String,
      utm_content: String,
      utm_term: String,
    },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);
