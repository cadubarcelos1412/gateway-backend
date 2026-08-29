import mongoose, { Schema, Document } from "mongoose";

/**
 * 📡 Registro de eventos de webhook da Sttart — garante idempotência.
 * Mesmo papel de ZendryWebhookEvent, coleção separada (não confunde os dois
 * históricos de auditoria numa mesma coleção "genérica de webhook").
 */
export interface ISttartWebhookEvent extends Document {
  eventId: string;
  eventType: string;
  rawPayload: unknown;
  createdAt: Date;
}

const SttartWebhookEventSchema = new Schema<ISttartWebhookEvent>(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    rawPayload: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const SttartWebhookEvent = mongoose.model<ISttartWebhookEvent>(
  "SttartWebhookEvent",
  SttartWebhookEventSchema
);
