import mongoose, { Schema, Document, Types } from "mongoose";

/* -------------------------------------------------------------------------- */
/* 📊 Tipagem para parâmetros de rastreamento (UTM e tracking)               */
/* -------------------------------------------------------------------------- */
export interface TrackingParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/* -------------------------------------------------------------------------- */
/* 📄 Interface principal da transação                                       */
/* -------------------------------------------------------------------------- */
export interface ITransaction extends Document {
  userId: Types.ObjectId;
  productId?: Types.ObjectId;
  amount: number;
  fee: number;
  netAmount: number;
  retention: number;
  /** Dias de retenção calculados na criação (RetentionEngine) — usado pra montar availableIn
   * SÓ quando a transação é de fato aprovada (ver applyZendryPaymentStatus). Pix é sempre 0. */
  retentionDays: number;
  type: "deposit" | "withdraw";
  method: "pix" | "credit_card" | "boleto";
  status: "pending" | "approved" | "failed";
  /** Marcado quando o ledger/wallet já foram revertidos (falha pós-reserva) — evita reversão duplicada. */
  reversedAt?: Date;
  /** Marcado quando o ledger/wallet já foram creditados de verdade (ver applyZendryPaymentStatus) —
   * evita creditar duas vezes se o status "approved" for aplicado mais de uma vez. */
  creditedAt?: Date;
  /** "test" para transações criadas com uma chave de API sk_test_...; "live" para dinheiro real. */
  mode: "test" | "live";
  /** Snapshot de qual adquirente processou essa transação (Seller.acquirer no momento da criação) —
   * necessário pra reconciliação (zendryReconciliation.service.ts / sttartReconciliation.service.ts)
   * saber qual API consultar. Ausente em transações antigas, criadas antes desse campo existir. */
  acquirer?: "zendry" | "sttart";
  description?: string;
  externalId?: string;
  postback?: string;
  riskFlags: string[];
  trackingParameters?: TrackingParameters;
  idempotencyKey?: string;
  /** Metadados livres enviados pelo integrador via API pública (POST /v1/payments). */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  paymentDetails?: {
    pixCode?: string;
    pixQrCodeBase64?: string;
    cardLastDigits?: string;
    cardBrand?: string;
    cardAuthorizationCode?: string;
    cardChargedAmount?: number;
  };
  purchaseData?: {
    customer?: {
      name?: string;
      email?: string;
      document?: string;
      phone?: string;
      ip?: string;
    };
    products?: {
      name: string;
      price: number;
    }[];
  };
}

/* -------------------------------------------------------------------------- */
/* 🏦 Esquema Mongoose – Transações com antifraude e auditoria               */
/* -------------------------------------------------------------------------- */
const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    retention: { type: Number, required: true },
    retentionDays: { type: Number, required: true, default: 0 },

    type: {
      type: String,
      enum: ["deposit", "withdraw"],
      required: true,
    },

    method: {
      type: String,
      enum: ["pix", "credit_card", "boleto"],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "failed"],
      default: "pending",
      index: true,
    },

    reversedAt: { type: Date },
    creditedAt: { type: Date },

    mode: {
      type: String,
      enum: ["test", "live"],
      default: "live",
      index: true,
    },

    acquirer: {
      type: String,
      enum: ["zendry", "sttart"],
      index: true,
    },

    description: { type: String, trim: true, maxlength: 255 },
    externalId: { type: String, index: true },
    postback: { type: String },

    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    metadata: { type: Schema.Types.Mixed },

    riskFlags: {
      type: [String],
      enum: ["HIGH_AMOUNT", "FOREIGN_IP", "NO_KYC"],
      default: [],
      index: true,
    },

    trackingParameters: {
      utm_source: { type: String, trim: true },
      utm_medium: { type: String, trim: true },
      utm_campaign: { type: String, trim: true },
      utm_content: { type: String, trim: true },
      utm_term: { type: String, trim: true },
    },

    paymentDetails: {
      pixCode: { type: String },
      pixQrCodeBase64: { type: String },
      cardLastDigits: { type: String },
      cardBrand: { type: String },
      cardAuthorizationCode: { type: String },
      cardChargedAmount: { type: Number },
    },

    purchaseData: {
      customer: {
        name: { type: String, trim: true },
        email: { type: String, trim: true },
        document: { type: String, trim: true },
        phone: { type: String, trim: true },
        ip: { type: String, trim: true },
      },
      products: [
        {
          name: { type: String, trim: true },
          price: { type: Number },
        },
      ],
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

/* -------------------------------------------------------------------------- */
/* 📊 Índices estratégicos – performance, antifraude e auditoria             */
/* -------------------------------------------------------------------------- */
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, mode: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ method: 1 });
// Consultas do painel master (getKpas/getAnalytics) filtram por status +
// intervalo de data SEM userId — os índices acima (todos começando por
// userId) não ajudam nesse caso. Sem isso, todo carregamento do dashboard
// master fazia varredura completa da coleção mesmo já filtrando por data.
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ "purchaseData.customer.document": 1 });
TransactionSchema.index({ "purchaseData.customer.email": 1 });
TransactionSchema.index({ riskFlags: 1 });
TransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);
