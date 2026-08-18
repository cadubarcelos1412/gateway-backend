import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * 📇 Favorecido salvo pelo seller pra reaproveitar na hora do saque Pix —
 * puramente um atalho de preenchimento (não é uma whitelist de segurança;
 * o saque continua exigindo PIN e KYC aprovado independente de vir de um
 * favorecido salvo ou digitado na hora).
 */
export interface ISavedBeneficiary extends Document {
  userId: Types.ObjectId;
  pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random";
  pixKey: string;
  holderName: string;
  holderDocument: string;
  createdAt: Date;
  updatedAt: Date;
}

const SavedBeneficiarySchema = new Schema<ISavedBeneficiary>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    pixKeyType: { type: String, enum: ["cpf", "cnpj", "email", "phone", "random"], required: true },
    pixKey: { type: String, required: true, trim: true },
    holderName: { type: String, required: true, trim: true },
    holderDocument: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// Não duplica o mesmo favorecido (mesma chave) pro mesmo seller — salvar de
// novo só atualiza o nome/documento se tiverem mudado.
SavedBeneficiarySchema.index({ userId: 1, pixKey: 1 }, { unique: true });

export const SavedBeneficiary = mongoose.model<ISavedBeneficiary>(
  "SavedBeneficiary",
  SavedBeneficiarySchema
);
