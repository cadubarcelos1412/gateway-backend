import mongoose, { Schema, Document, Types } from "mongoose";

export type VerificationPurpose = "signup" | "password_reset" | "pin_reset";

/**
 * Código de 6 dígitos enviado por e-mail — mecanismo compartilhado por 3
 * fluxos (verificação de cadastro, recuperação de senha, recuperação de
 * PIN de saque). Nunca guarda o código em texto puro, só o hash.
 */
export interface IVerificationCode extends Document {
  userId: Types.ObjectId;
  purpose: VerificationPurpose;
  codeHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  attempts: number;
  createdAt: Date;
}

const VerificationCodeSchema = new Schema<IVerificationCode>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["signup", "password_reset", "pin_reset"], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

VerificationCodeSchema.index({ userId: 1, purpose: 1, createdAt: -1 });
// TTL — o Mongo apaga sozinho os documentos expirados, sem job de limpeza.
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationCode = mongoose.model<IVerificationCode>(
  "VerificationCode",
  VerificationCodeSchema
);
