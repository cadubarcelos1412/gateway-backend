import mongoose, { Schema, Document } from "mongoose";

export type UserRole = "seller" | "admin" | "master";
export type UserStatus = "pending" | "active" | "suspended";

export interface IUser extends Document {
  name?: string;
  email: string;
  password: string;
  role: UserRole;
  status?: UserStatus;
  createdAt?: Date;
  updatedAt?: Date;

  /** ✅ CPF ou CNPJ do usuário (obrigatório p/ Bacen e adquirentes) */
  document: string;

  /** 🔐 Tokens e integrações externas */
  token?: {
    pushcut?: {
      notificationUrl?: string;
    };
    webhook?: {
      paidUrl?: string;
      generatedUrl?: string;
    };
    utmify?: {
      apiKey?: string;
    };
    secret?: string;
  };

  /** 💸 Split configurável por método */
  split?: {
    cashIn: {
      pix: {
        fixed: number;
        percentage: number;
      };
      creditCard: {
        fixed: number;
        percentage: number;
      };
      boleto: {
        fixed: number;
        percentage: number;
      };
    };
  };
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["seller", "admin", "master"],
      default: "seller",
    },
    status: {
      type: String,
      enum: ["pending", "active", "suspended"],
      default: "pending",
    },

    /** ✅ CPF/CNPJ obrigatório e único */
    document: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    token: {
      pushcut: { notificationUrl: String },
      webhook: {
        paidUrl: String,
        generatedUrl: String,
      },
      utmify: { apiKey: String },
      secret: String,
    },

    split: {
      cashIn: {
        pix: {
          fixed: { type: Number, default: 0.0 },
          percentage: { type: Number, default: 0.0 },
        },
        creditCard: {
          fixed: { type: Number, default: 0.0 },
          percentage: { type: Number, default: 0.0 },
        },
        boleto: {
          fixed: { type: Number, default: 0.0 },
          percentage: { type: Number, default: 0.0 },
        },
      },
    },
  },
  { timestamps: true }
);

// 📊 Índices úteis
userSchema.index({ email: 1 });
userSchema.index({ document: 1 }, { unique: true });
userSchema.index({ status: 1 });
userSchema.index({ role: 1 });

export const User = mongoose.model<IUser>("User", userSchema);
