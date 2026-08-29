import mongoose, { Schema, Document, Types } from "mongoose";

export type KycDocType =
  | "cnh_frente"
  | "cnh_verso"
  | "selfie"
  | "comprovante_endereco"
  | "contrato_social"
  | "cartao_cnpj";

export interface IKycDocument extends Document {
  sellerId: Types.ObjectId;
  docType: KycDocType;
  url: string;
  /** public_id do Cloudinary — necessário pra gerar URL assinada nova (upload
   * usa type:"authenticated", ver kyc.controller.ts) em vez de reusar `url`
   * como link público permanente. */
  publicId?: string;
  resourceType?: string;
  mimeType: string;
  checksum: string;
  uploadedBy: Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  uploadedAt: Date;
}

const KycDocumentSchema = new Schema<IKycDocument>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    docType: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    publicId: { type: String },
    resourceType: { type: String },
    mimeType: { type: String, required: true },
    checksum: { type: String, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false, versionKey: false }
);

KycDocumentSchema.index({ sellerId: 1, docType: 1, uploadedAt: -1 });

export const KycDocument = mongoose.model<IKycDocument>("KycDocument", KycDocumentSchema);
