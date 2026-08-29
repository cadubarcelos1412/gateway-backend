// src/models/webhookEndpoint.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export const WEBHOOK_EVENT_TYPES = [
  "payment.created",
  "payment.paid",
  "payment.failed",
  "payment.expired",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface IWebhookEndpoint extends Document {
  merchantId: Types.ObjectId;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEndpointSchema = new Schema<IWebhookEndpoint>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    url: { type: String, required: true, trim: true },
    events: { type: [String], default: ["*"] },
    // whsec_... — este pode ser exibido no dashboard (não é usado para autenticar chamadas de entrada).
    secret: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id?.toString();
        // `as any` — mesma correção de apiKey.model.ts (atualização do
        // mongoose via npm audit fix, 2026-08-30).
        delete (ret as any)._id;
        return ret;
      },
    },
  }
);

export const WebhookEndpoint = mongoose.model<IWebhookEndpoint>("WebhookEndpoint", WebhookEndpointSchema);
