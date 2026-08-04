// src/models/apiKey.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export type ApiKeyType = "secret" | "publishable";
export type ApiKeyMode = "test" | "live";

export interface IApiKey extends Document {
  merchantId: Types.ObjectId;
  name: string;
  type: ApiKeyType;
  mode: ApiKeyMode;
  keyPrefix: string;
  last4: string;
  hashedKey: string;
  scopes: string[];
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 80 },

    type: { type: String, enum: ["secret", "publishable"], required: true },
    mode: { type: String, enum: ["test", "live"], required: true },

    // Prefixo exibível no dashboard (ex.: "sk_live_a1b2c3d4") — nunca a chave inteira.
    keyPrefix: { type: String, required: true },
    last4: { type: String, required: true },

    // SHA-256 da chave completa. A chave em si nunca é persistida.
    hashedKey: { type: String, required: true, unique: true, index: true },

    scopes: { type: [String], default: ["*"] },

    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.hashedKey;
        return ret;
      },
    },
  }
);

ApiKeySchema.index({ merchantId: 1, revokedAt: 1 });

export const ApiKey = mongoose.model<IApiKey>("ApiKey", ApiKeySchema);
