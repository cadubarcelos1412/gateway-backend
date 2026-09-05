// src/models/webhookEndpoint.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

// Eventos de seller (cash-in + cash-out) — assinados por endpoints
// `scope: "seller"`. "payment.expired" catalogado mas ainda não disparado
// em lugar nenhum (precisaria de um job de varredura de Pix expirado que
// não existe hoje — ver plano de webhooks, 2026-09-05).
export const WEBHOOK_EVENT_TYPES = [
  "payment.created",
  "payment.paid",
  "payment.failed",
  "payment.expired",
  "payment.refunded",
  "payment.chargedback",
  "payment.partially_canceled",
  "withdraw.created",
  "withdraw.approved",
  "withdraw.rejected",
  "withdraw.completed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

// Eventos de plataforma — só endpoints `scope: "platform"` (só master
// cria/vê/edita) podem assinar. Não faz sentido um endpoint de plataforma
// assinar "payment.paid" (isso é por seller).
export const PLATFORM_EVENT_TYPES = [
  "platform.kyc_pending",
  "platform.kyc_approved",
  "platform.wire_requested",
  "platform.payment_failed",
] as const;

export type PlatformEventType = (typeof PLATFORM_EVENT_TYPES)[number];

export type WebhookEndpointScope = "seller" | "platform";

export interface IWebhookEndpoint extends Document {
  /** Ausente quando scope === "platform". */
  merchantId?: Types.ObjectId;
  scope: WebhookEndpointScope;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEndpointSchema = new Schema<IWebhookEndpoint>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "Seller", index: true },
    scope: { type: String, enum: ["seller", "platform"], default: "seller", index: true },
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
