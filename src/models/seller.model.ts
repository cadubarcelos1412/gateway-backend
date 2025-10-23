// src/models/seller.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

/* -------------------------------------------------------------------------- */
/* 📌 Tipos auxiliares                                                        */
/* -------------------------------------------------------------------------- */

export type SellerType = "PF" | "PJ";
export type KycStatus = "pending" | "under_review" | "approved" | "rejected" | "active";
export type AcquirerType = "pagarme" | "stripe" | "reflowpay";

export interface IAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface IDocumentFile {
  url: string;
  uploadedAt: Date;
  mimeType?: string;
  checksum?: string;
}

export interface IKycDocuments {
  rgFront?: IDocumentFile;
  rgBack?: IDocumentFile;
  cpf?: IDocumentFile;
  cnpjDoc?: IDocumentFile;
  articlesOfAssociation?: IDocumentFile;
  powerOfAttorney?: IDocumentFile;
  proofOfAddress?: IDocumentFile;
}

export interface IStatusHistory {
  from: KycStatus;
  to: KycStatus;
  changedBy?: Types.ObjectId;
  reason?: string;
  changedAt: Date;
}

export interface ISplitConfig {
  cashIn: {
    pix: { fixed: number; percentage: number };
    credit_card: { fixed: number; percentage: number };
    boleto: { fixed: number; percentage: number };
  };
  cashOut: {
    pix: { fixed: number; percentage: number };
  };
}

/* -------------------------------------------------------------------------- */
/* 📄 Interface principal do Seller                                          */
/* -------------------------------------------------------------------------- */

export interface ISeller extends Document {
  userId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  type: SellerType;
  documentNumber: string;
  address: IAddress;

  acquirer: AcquirerType; // 🏦 adquirente usada por esse seller

  kycStatus: KycStatus;
  kycDocuments: IKycDocuments;
  statusHistory: IStatusHistory[];

  split: ISplitConfig;

  status: "active" | "suspended" | "blocked";

  createdAt: Date;
  updatedAt: Date;
}

/* -------------------------------------------------------------------------- */
/* 🛠️ Schemas auxiliares                                                     */
/* -------------------------------------------------------------------------- */

const DocumentFileSchema = new Schema<IDocumentFile>(
  {
    url: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, required: true, default: () => new Date() },
    mimeType: { type: String, trim: true },
    checksum: { type: String, trim: true },
  },
  { _id: false }
);

const KycDocumentsSchema = new Schema<IKycDocuments>(
  {
    rgFront: { type: DocumentFileSchema },
    rgBack: { type: DocumentFileSchema },
    cpf: { type: DocumentFileSchema },
    cnpjDoc: { type: DocumentFileSchema },
    articlesOfAssociation: { type: DocumentFileSchema },
    powerOfAttorney: { type: DocumentFileSchema },
    proofOfAddress: { type: DocumentFileSchema },
  },
  { _id: false }
);

const AddressSchema = new Schema<IAddress>(
  {
    street: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    complement: { type: String, trim: true },
    district: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, minlength: 2, maxlength: 2 },
    country: { type: String, required: true, trim: true, minlength: 2, maxlength: 2, default: "BR" },
    postalCode: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const StatusHistorySchema = new Schema<IStatusHistory>(
  {
    from: { type: String, enum: ["pending", "under_review", "approved", "rejected", "active"], required: true },
    to: { type: String, enum: ["pending", "under_review", "approved", "rejected", "active"], required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, trim: true },
    changedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

/* -------------------------------------------------------------------------- */
/* 🏦 Schema principal de Seller                                             */
/* -------------------------------------------------------------------------- */

const SellerSchema = new Schema<ISeller>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Endereço de email inválido"],
      index: true,
    },
    phone: { type: String, trim: true },

    type: { type: String, enum: ["PF", "PJ"], required: true },
    documentNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
      unique: true,
    },

    address: { type: AddressSchema, required: true },

    // 🏦 Multiadquirência – cada seller pode ter sua adquirente configurada
    acquirer: {
      type: String,
      enum: ["pagarme", "stripe", "reflowpay"],
      default: "pagarme",
      required: true,
      index: true,
    },

    kycStatus: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected", "active"],
      default: "pending",
      index: true,
    },

    kycDocuments: { type: KycDocumentsSchema, default: {} },

    statusHistory: { type: [StatusHistorySchema], default: [] },

    split: {
      type: Object,
      default: {
        cashIn: {
          pix: { fixed: 0, percentage: 2.99 },
          credit_card: { fixed: 0, percentage: 3.49 },
          boleto: { fixed: 0, percentage: 2.99 },
        },
        cashOut: {
          pix: { fixed: 0.15, percentage: 0 },
        },
      },
    },

    status: {
      type: String,
      enum: ["active", "suspended", "blocked"],
      default: "active",
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id?.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

/* -------------------------------------------------------------------------- */
/* 🧪 Validações pré-salvar                                                  */
/* -------------------------------------------------------------------------- */

SellerSchema.pre("validate", function (next) {
  const onlyDigits = (v: string) => (v || "").replace(/\D+/g, "");
  if (this.documentNumber) this.documentNumber = onlyDigits(this.documentNumber);
  if (this.phone) this.phone = onlyDigits(this.phone);
  if (this.address?.postalCode) this.address.postalCode = onlyDigits(this.address.postalCode);
  next();
});

SellerSchema.pre("save", function (next) {
  if (this.name) this.name = this.name.trim();
  if (this.email) this.email = this.email.trim().toLowerCase();
  next();
});

/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos                                                   */
/* -------------------------------------------------------------------------- */
SellerSchema.index({ userId: 1, kycStatus: 1 });
SellerSchema.index({ name: "text", email: "text" });
SellerSchema.index({ acquirer: 1 });

/* -------------------------------------------------------------------------- */
/* 📤 Exportação                                                             */
/* -------------------------------------------------------------------------- */
export const Seller = mongoose.model<ISeller>("Seller", SellerSchema);
