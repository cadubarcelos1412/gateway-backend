// src/models/seller.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";
import { IFeeTable } from "./feeTable.types";
import { FeeTableSchema } from "./feeTable.schema";

/* -------------------------------------------------------------------------- */
/* 📌 Tipos auxiliares                                                        */
/* -------------------------------------------------------------------------- */

export type SellerType = "PF" | "PJ";
export type KycStatus = "pending" | "under_review" | "approved" | "rejected" | "active";
// Pagar.me e ReflowPay removidos (2026-08-06) — nenhum seller usava, nenhuma
// das duas era integração real/confirmada. Sttart adicionada 2026-08-29
// (contrato assinado 2026-08-18) — ver acquirers/sttart.acquirer.ts.
export type AcquirerType = "zendry" | "sttart";

/**
 * 🏦 Adquirente POR MÉTODO (2026-08-30) — antes, `Seller.acquirer` (abaixo)
 * decidia Pix, cartão e swap USDT ao mesmo tempo, o que não reflete a
 * realidade: a Sttart não faz cartão, por exemplo. `null` explícito
 * significa "método desligado de propósito pra esse seller" (não é
 * "esqueceram de configurar") — ver resolveSellerAcquirer em
 * acquirers/index.ts, que é o ÚNICO lugar que deve interpretar isso.
 */
export type AcquirerSelection = AcquirerType | null;
export interface IAcquirerConfig {
  pix?: AcquirerSelection;
  card?: AcquirerSelection;
  swap?: AcquirerSelection;
}

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
  /** public_id do Cloudinary — necessário pra gerar URL assinada nova a cada
   * consulta (ver kyc.controller.ts) depois do upload passar a usar
   * type:"authenticated". `url` fica só como snapshot histórico/checksum;
   * a URL de verdade servida ao cliente é sempre recalculada na hora. */
  publicId?: string;
  resourceType?: string;
}

// Chave = docType (ex.: "cnh_frente", "comprovante_endereco" — ver REQUIRED_DOCS em
// kyc.controller.ts, fonte única de verdade pra quais chaves existem por tipo PF/PJ).
// Map em vez de campos fixos: evita reeditar o schema toda vez que a lista de
// documentos exigidos mudar, e já bate com o que uploadKycDocument grava hoje.
export type IKycDocuments = Map<string, IDocumentFile>;

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

  /** @deprecated fallback legado — usado quando `acquirerConfig` não tem a
   * capability configurada ainda (seller nunca editado na tela nova). Não
   * ler direto em código novo, usar resolveSellerAcquirer. */
  acquirer: AcquirerType;
  /** Adquirente por método (Pix/cartão/swap) — ver resolveSellerAcquirer em
   * acquirers/index.ts. Fonte de verdade a partir de 2026-08-30. */
  acquirerConfig?: IAcquirerConfig;

  kycStatus: KycStatus;
  kycDocuments: IKycDocuments;
  statusHistory: IStatusHistory[];

  split: ISplitConfig;
  feeTable?: IFeeTable; // 💳 taxa real (pix in/out, cartão por bandeira×parcela, D dias, antecipação) — snapshot do padrão global na criação, editável individualmente

  status: "active" | "suspended" | "blocked";

  /** Saque PIX automático (sem aprovação manual do master) — desligado por padrão pra
   * seller novo. Ligado só por decisão explícita do master, ver SellerDetailPage. */
  autoWithdrawEnabled: boolean;

  /** Libera o pedido de wire internacional (SWIFT via Sttart, fluxo 100% manual — ver
   * wireCashout.service.ts). Desligado por padrão — operação sensível (câmbio, compliance),
   * liberada seller a seller pelo master, mesmo padrão de autoWithdrawEnabled. */
  wireEnabled: boolean;
  /** Tetos opcionais em BRL pra wire — nenhum configurável por UI ainda (sem tela pra isso),
   * só a estrutura pronta pra quando for preciso usar. Ausente/undefined = sem limite. */
  wireLimits?: {
    perTransaction?: number;
    daily?: number;
    monthly?: number;
  };

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
    publicId: { type: String, trim: true },
    resourceType: { type: String, trim: true },
  },
  { _id: false }
);

// Map<docType, IDocumentFile> — ver comentário em IKycDocuments acima.
const KycDocumentsSchemaType = { type: Map, of: DocumentFileSchema, default: () => new Map() };

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
      enum: ["zendry", "sttart"],
      default: "zendry",
      required: true,
      index: true,
    },

    // 🏦 Adquirente por método — cada campo é independente (enum aplicado
    // individualmente, não ao objeto inteiro). `null` = método desligado de
    // propósito; ausente = ainda cai no fallback `acquirer` acima (ver
    // resolveSellerAcquirer em acquirers/index.ts).
    acquirerConfig: {
      pix: { type: String, enum: ["zendry", "sttart", null], default: undefined },
      card: { type: String, enum: ["zendry", "sttart", null], default: undefined },
      swap: { type: String, enum: ["zendry", "sttart", null], default: undefined },
    },

    kycStatus: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected", "active"],
      default: "pending",
      index: true,
    },

    kycDocuments: KycDocumentsSchemaType,

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

    // 💳 Tabela de taxas real — ausente em sellers antigos (fallback pro split acima
    // até o backfill rodar), populada a partir do SystemFeeConfig ao criar o seller.
    feeTable: { type: FeeTableSchema, required: false },

    status: {
      type: String,
      enum: ["active", "suspended", "blocked"],
      default: "active",
    },

    autoWithdrawEnabled: { type: Boolean, default: false },
    wireEnabled: { type: Boolean, default: false },
    wireLimits: {
      perTransaction: { type: Number },
      daily: { type: Number },
      monthly: { type: Number },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
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
