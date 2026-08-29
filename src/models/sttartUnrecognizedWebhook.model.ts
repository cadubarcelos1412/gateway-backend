import mongoose, { Schema, Document } from "mongoose";

/**
 * 📡 Eventos do webhook da Sttart que autenticaram certinho mas cujo payload
 * não bateu com o parser conhecido (parseSttartWebhook) — mesmo papel de
 * ZendryUnrecognizedWebhook, que já provou o valor dessa rede de segurança
 * na prática (um evento real de saque da Zendry ficou invisível por horas
 * antes disso existir).
 */
export interface ISttartUnrecognizedWebhook extends Document {
  headers: Record<string, unknown>;
  body: unknown;
  createdAt: Date;
}

const SttartUnrecognizedWebhookSchema = new Schema<ISttartUnrecognizedWebhook>(
  {
    headers: { type: Schema.Types.Mixed, required: true },
    body: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

export const SttartUnrecognizedWebhook = mongoose.model<ISttartUnrecognizedWebhook>(
  "SttartUnrecognizedWebhook",
  SttartUnrecognizedWebhookSchema
);
