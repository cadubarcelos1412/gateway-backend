import mongoose, { Schema, Document } from "mongoose";

/**
 * 🩺 Log de diagnóstico TEMPORÁRIO — captura toda chamada que chega em
 * /api/transactions/webhook/zendry, autenticada ou não, parseada ou não.
 * Existe só pra confirmar ao vivo (sem acesso aos logs do Render) se a
 * Zendry está realmente batendo aqui depois da migração pro painel novo, e
 * com qual formato/header. Remover depois de confirmar o header de
 * assinatura correto e o formato do payload Nativo — não é uma tabela
 * pensada pra ficar pra sempre (sem índice, sem retenção definida).
 */
export interface IZendryWebhookRawLog extends Document {
  headers: Record<string, unknown>;
  body: unknown;
  authOk: boolean;
  authMethod: "legacy_key" | "hmac" | "none";
  createdAt: Date;
}

const ZendryWebhookRawLogSchema = new Schema<IZendryWebhookRawLog>(
  {
    headers: { type: Schema.Types.Mixed, required: true },
    body: { type: Schema.Types.Mixed, required: true },
    authOk: { type: Boolean, required: true },
    authMethod: { type: String, enum: ["legacy_key", "hmac", "none"], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export const ZendryWebhookRawLog = mongoose.model<IZendryWebhookRawLog>(
  "ZendryWebhookRawLog",
  ZendryWebhookRawLogSchema
);
