// src/models/webhookDelivery.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IWebhookDelivery extends Document {
  endpointId: Types.ObjectId;
  merchantId: Types.ObjectId;
  eventId: string;
  eventType: string;
  url: string;
  attempt: number;
  responseStatus: number;
  success: boolean;
  error?: string;
  createdAt: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>({
  endpointId: { type: Schema.Types.ObjectId, ref: "WebhookEndpoint", required: true, index: true },
  merchantId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
  eventId: { type: String, required: true, index: true },
  eventType: { type: String, required: true },
  url: { type: String, required: true },
  attempt: { type: Number, required: true },
  responseStatus: { type: Number, default: 0 },
  success: { type: Boolean, default: false },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const WebhookDelivery = mongoose.model<IWebhookDelivery>("WebhookDelivery", WebhookDeliverySchema);
