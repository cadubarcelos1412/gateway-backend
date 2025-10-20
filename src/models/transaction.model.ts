import mongoose, { Schema, Document, Types } from "mongoose";

/* -------------------------------------------------------------------------- */
/* 📊 Tipagem para parâmetros de rastreamento (UTM e tracking)               */
/* -------------------------------------------------------------------------- */
export interface TrackingParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/* -------------------------------------------------------------------------- */
/* 📄 Interface principal da transação                                       */
/* -------------------------------------------------------------------------- */
export interface ITransaction extends Document {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  amount: number;
  fee: number;
  netAmount: number;
  retention: number;
  type: "deposit" | "withdraw";
  method: "pix" | "credit_card" | "boleto";
  status: "pending" | "approved" | "failed";
  description?: string;
  externalId?: string;
  postback?: string;
  riskFlags: string[];
  trackingParameters?: TrackingParameters;
  idempotencyKey?: string;
  createdAt: Date;
  purchaseData?: {
    customer?: {
      name?: string;
      email?: string;
      document?: string;
      phone?: string;
      ip?: string;
    };
    products?: {
      name: string;
      price: number;
    }[];
  };
}

/* -------------------------------------------------------------------------- */
/* 🏦 Esquema Mongoose – Transações com antifraude e auditoria               */
/* -------------------------------------------------------------------------- */
const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    retention: { type: Number, required: true },

    type: {
      type: String,
      enum: ["deposit", "withdraw"],
      required: true,
    },

    method: {
      type: String,
      enum: ["pix", "credit_card", "boleto"],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "failed"],
      default: "pending",
      index: true,
    },

    description: { type: String, trim: true, maxlength: 255 },
    externalId: { type: String, index: true },
    postback: { type: String },

    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    riskFlags: {
      type: [String],
      enum: ["HIGH_AMOUNT", "FOREIGN_IP", "NO_KYC"],
      default: [],
      index: true,
    },

    trackingParameters: {
      utm_source: { type: String, trim: true },
      utm_medium: { type: String, trim: true },
      utm_campaign: { type: String, trim: true },
      utm_content: { type: String, trim: true },
      utm_term: { type: String, trim: true },
    },

    purchaseData: {
      customer: {
        name: { type: String, trim: true },
        email: { type: String, trim: true },
        document: { type: String, trim: true },
        phone: { type: String, trim: true },
        ip: { type: String, trim: true },
      },
      products: [
        {
          name: { type: String, trim: true },
          price: { type: Number },
        },
      ],
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos – performance, antifraude e auditoria             */
/* -------------------------------------------------------------------------- */
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ method: 1 });
TransactionSchema.index({ "purchaseData.customer.document": 1 });
TransactionSchema.index({ "purchaseData.customer.email": 1 });
TransactionSchema.index({ riskFlags: 1 });
TransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);
