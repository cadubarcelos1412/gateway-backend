import mongoose, { Schema, Document } from "mongoose";

/**
 * 📡 Registro de eventos do webhook da Zendry que autenticaram certinho
 * (HMAC ou ?key= válidos) mas cujo payload não bateu com nenhum parser
 * conhecido (Legado nem Nativo) — normalmente porque é um tipo de evento
 * novo ou com campos diferentes do que já mapeamos.
 *
 * Existe porque isso já aconteceu de verdade e ficou invisível por horas:
 * o webhook de saque (Pix enviado) chegou, autenticou, respondeu 200 (a
 * Zendry mostrou "Entregue" no painel dela), mas o parser não reconheceu o
 * formato de "pix.sent" e nada foi processado — sem ISSO registrado em
 * algum lugar, não tinha como saber que aconteceu sem acesso aos logs do
 * Render. Não é uma tabela de debug temporária — é a rede de segurança
 * permanente pra formato de payload novo/desconhecido.
 */
export interface IZendryUnrecognizedWebhook extends Document {
  headers: Record<string, unknown>;
  body: unknown;
  createdAt: Date;
}

const ZendryUnrecognizedWebhookSchema = new Schema<IZendryUnrecognizedWebhook>(
  {
    headers: { type: Schema.Types.Mixed, required: true },
    body: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

export const ZendryUnrecognizedWebhook = mongoose.model<IZendryUnrecognizedWebhook>(
  "ZendryUnrecognizedWebhook",
  ZendryUnrecognizedWebhookSchema
);
