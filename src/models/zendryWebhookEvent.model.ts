import mongoose, { Schema, Document } from "mongoose";

/**
 * 📡 Registro de eventos de webhook da Zendry — garante idempotência.
 * Equivalente Mongo da tabela `payment_webhooks` (external_id, action)
 * descrita em ZENDRY-MIGRATION.md: um índice único composto faz a segunda
 * tentativa do mesmo evento colidir no insert e ser ignorada, enquanto uma
 * mudança real de status (action diferente) conta como evento novo.
 */
export interface IZendryWebhookEvent extends Document {
  externalId: string;
  action: string;
  rawPayload: unknown;
  createdAt: Date;
}

const ZendryWebhookEventSchema = new Schema<IZendryWebhookEvent>(
  {
    externalId: { type: String, required: true },
    action: { type: String, required: true },
    rawPayload: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

ZendryWebhookEventSchema.index({ externalId: 1, action: 1 }, { unique: true });

export const ZendryWebhookEvent = mongoose.model<IZendryWebhookEvent>(
  "ZendryWebhookEvent",
  ZendryWebhookEventSchema
);
