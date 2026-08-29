import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * 💳 Status possíveis do Cashout
 * - pending: criado e aguardando aprovação
 * - approved: aprovado e em processo de liquidação
 * - rejected: rejeitado manualmente
 * - completed: liquidação bancária confirmada
 *
 * ⚠️ Pra rail === "wire": nunca passa por "approved" (pula direto pending →
 * completed/rejected, ver wireCashout.service.ts). E "completed" ali NUNCA
 * significa "o beneficiário confirmou recebimento" — significa só "o master
 * registrou que mandou manualmente pelo painel da Sttart" (não existe
 * confirmação automática de wire internacional pra gente). Ver
 * wireExecution.providerStatus pro texto exato exibido.
 */
export type CashoutStatus = "pending" | "approved" | "rejected" | "completed";

/**
 * 🌐 Wire internacional (SWIFT) via Sttart — 100% manual do lado dela (sem
 * API, ver docs/architecture e services/wireCashout.service.ts). Campos
 * espelham 1:1 o formulário do dashboard da Sttart (prints do usuário,
 * 2026-08-29): Beneficiário, Dados Bancários, Banco Intermediário
 * (opcional), Contato, Invoice.
 */
export interface IWireDetails {
  beneficiary: { name: string; country?: string; address: string; natureOfOperation?: string };
  bank: { name: string; country?: string; swiftBic: string; abaRouting?: string; accountNumber: string; iban?: string };
  intermediaryBank?: { name?: string; swiftBic?: string; country?: string; abaRouting?: string; iban?: string };
  contact: { name?: string; phoneCountryCode?: string; phone?: string; emailForCopy: string };
  /** SHA/OUR/BEN só é REGISTRADO — não afeta nosso cálculo de valor líquido
   * (a Sttart não documenta o desconto bancário exato de cada modalidade;
   * inventar esse número seria contra a regra do projeto). */
  feeType: "SHA" | "OUR" | "BEN";
  invoice?: { url?: string; uploadedAt?: Date; mimeType?: string };
  /** Texto livre — só usado quando não há upload de invoice (mesma regra do form da Sttart). */
  invoiceData?: string;
  currency: "USD" | "EUR";
}

/** Cotação travada no PEDIDO — vira a base do teto (maxBrlAmount), nunca do valor final cobrado. */
export interface IWireQuote {
  baseCurrency: "USD" | "EUR";
  rate: number;
  quotedAt: Date;
  expiresAt: Date;
  requestedForeignAmount: number;
}

/** Cada item do checklist de compliance guarda QUEM e QUANDO marcou — nunca um boolean solto. */
export interface IWireComplianceCheck {
  checkedBy: Types.ObjectId;
  checkedAt: Date;
}
export interface IWireCompliance {
  beneficiaryVerified?: IWireComplianceCheck;
  bankDetailsVerified?: IWireComplianceCheck;
  documentationVerified?: IWireComplianceCheck;
  sanctionsChecked?: IWireComplianceCheck;
  kycVerified?: IWireComplianceCheck;
}

/**
 * Preenchido na CONFIRMAÇÃO (services/wireCashout.service.ts
 * completeWireCashout), com os números REAIS do envio manual — nunca na
 * criação. `providerStatus` é deliberadamente inequívoco: significa "o
 * master mandou, manualmente", NUNCA "o beneficiário confirmou
 * recebimento" (câmbio internacional não tem confirmação automática pra
 * gente, ver ressalva no status "completed" do CashoutRequest).
 */
export interface IWireExecution {
  executedAt: Date;
  executedBy: Types.ObjectId;
  executedForeignAmount: number;
  /** Custo real em BRL da compra da moeda — SEM a nossa fee (fee não varia com câmbio). */
  executedNetAmount: number;
  swiftReference?: string;
  uetr?: string;
  adminNote?: string;
  providerStatus: string;
}

/**
 * 🧾 Interface da Solicitação de Saque
 */
export interface ICashoutRequest extends Document {
  userId: Types.ObjectId;
  amount: number;
  status: CashoutStatus;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  /** "app" (padrão, ausente = app) — saque pedido/enviado por aqui. "manual" —
   * o master fez o saque direto no painel da Zendry (workaround enquanto a
   * Zendry está instável) e só está registrando aqui pra manter o saldo
   * batendo com o real, ver CashoutService.recordManualWithdrawal. */
  origin?: "app" | "manual";
  /** Decisão de negócio (2026-08-17): quando setado, se esse saque acabar
   * cancelado/falhado, o valor devolvido NÃO volta pro seller original —
   * vai pra esse userId em vez disso. Usado quando o erro foi do próprio
   * seller (ex.: digitou a chave Pix errada) e a plataforma decide reter o
   * valor recuperado em vez de devolver pra quem causou o problema. Ver
   * CashoutService.refundFailedPixPayout. */
  refundToUserId?: Types.ObjectId;

  /** Snapshot de qual adquirente processou o ENVIO desse saque (gravado em
   * sendApprovedPixPayout/createCryptoCashout, ver cashout.service.ts) — não é
   * o Seller.acquirer atual, é o que estava configurado no momento do envio.
   * Necessário pra reconciliação (pixPayoutReconciliation.service.ts) saber
   * qual API consultar, mesmo que o master troque a adquirente do seller
   * depois. Ausente em saques antigos, criados antes desse campo existir
   * (reconciliação trata ausência como "zendry", único caso possível na época). */
  acquirer?: "zendry" | "sttart";

  /** Trilho do saque — "pix" (padrão, fluxo manual existente), "usdt" (automático) ou
   * "wire" (SWIFT internacional via Sttart, 100% manual — ver IWireDetails/IWireExecution). */
  rail: "pix" | "usdt" | "wire";
  /** Endereço USDT de destino informado pelo seller — só existe quando rail === "usdt". */
  destinationAddress?: string;
  /** Tipo/valor/titular da chave Pix — só existe quando rail === "pix". O envio em si ainda é
   * manual (ver approveCashout), então isso é o que quem aprova usa pra saber pra onde mandar. */
  pixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random";
  pixKey?: string;
  pixKeyHolderName?: string;
  /** CPF/CNPJ do titular da chave — a Zendry pede isso pra registrar o pagamento
   * (confirmado testando o painel deles diretamente em 2026-08-10; a doc da API
   * dizia opcional pra modo "dict", mas o envio real falhava sem isso). */
  pixKeyHolderDocument?: string;
  /** Rede da carteira (ex.: "trc20") — não confirmada com a Zendry, ver ZENDRY-MIGRATION.md. */
  network?: string;
  /** Cotação BRL/USDT no momento do saque — snapshot pra auditoria/disputa. */
  quotedBrlPrice?: number;
  /** Valor em USDT efetivamente enviado. */
  usdtAmount?: number;
  fee?: number;
  netAmount?: number;
  /** reference_code devolvido pela Zendry — usado se algum dia existir consulta/webhook de status. */
  externalReference?: string;
  /** status bruto devolvido pela Zendry (ex.: "pending") — não sabemos os valores possíveis além desse. */
  providerStatus?: string;

  /** Teto em BRL congelado do saldo disponível no PEDIDO do wire (rail === "wire") — imutável,
   * usado só pra validar que o valor REAL executado (wireExecution) nunca ultrapassa o que foi
   * reservado. `amount`/`fee`/`netAmount` começam iguais a esse teto (estimativa) e são
   * SOBRESCRITOS com os valores reais na confirmação — ver wireCashout.service.ts. */
  maxBrlAmount?: number;
  wireDetails?: IWireDetails;
  wireQuote?: IWireQuote;
  wireCompliance?: IWireCompliance;
  wireExecution?: IWireExecution;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 🧱 Schema Mongoose
 */
const CashoutRequestSchema = new Schema<ICashoutRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0.01 },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
      required: true,
    },

    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    origin: { type: String, enum: ["app", "manual"] },
    refundToUserId: { type: Schema.Types.ObjectId, ref: "User" },
    acquirer: { type: String, enum: ["zendry", "sttart"] },

    rail: { type: String, enum: ["pix", "usdt", "wire"], default: "pix", required: true },
    destinationAddress: { type: String, trim: true },
    pixKeyType: { type: String, enum: ["cpf", "cnpj", "email", "phone", "random"] },
    pixKey: { type: String, trim: true },
    pixKeyHolderName: { type: String, trim: true },
    pixKeyHolderDocument: { type: String, trim: true },
    network: { type: String, trim: true },
    quotedBrlPrice: { type: Number },
    usdtAmount: { type: Number },
    fee: { type: Number },
    netAmount: { type: Number },
    externalReference: { type: String, index: true },
    providerStatus: { type: String },

    maxBrlAmount: { type: Number },
    wireDetails: {
      type: {
        beneficiary: {
          name: { type: String, trim: true },
          country: { type: String, trim: true },
          address: { type: String, trim: true },
          natureOfOperation: { type: String, trim: true },
        },
        bank: {
          name: { type: String, trim: true },
          country: { type: String, trim: true },
          swiftBic: { type: String, trim: true },
          abaRouting: { type: String, trim: true },
          accountNumber: { type: String, trim: true },
          iban: { type: String, trim: true },
        },
        intermediaryBank: {
          name: { type: String, trim: true },
          swiftBic: { type: String, trim: true },
          country: { type: String, trim: true },
          abaRouting: { type: String, trim: true },
          iban: { type: String, trim: true },
        },
        contact: {
          name: { type: String, trim: true },
          phoneCountryCode: { type: String, trim: true },
          phone: { type: String, trim: true },
          emailForCopy: { type: String, trim: true },
        },
        feeType: { type: String, enum: ["SHA", "OUR", "BEN"] },
        invoice: {
          url: { type: String },
          uploadedAt: { type: Date },
          mimeType: { type: String },
        },
        invoiceData: { type: String },
        currency: { type: String, enum: ["USD", "EUR"] },
      },
      _id: false,
    },
    wireQuote: {
      type: {
        baseCurrency: { type: String, enum: ["USD", "EUR"] },
        rate: { type: Number },
        quotedAt: { type: Date },
        expiresAt: { type: Date },
        requestedForeignAmount: { type: Number },
      },
      _id: false,
    },
    wireCompliance: {
      type: {
        beneficiaryVerified: { checkedBy: { type: Schema.Types.ObjectId, ref: "User" }, checkedAt: { type: Date } },
        bankDetailsVerified: { checkedBy: { type: Schema.Types.ObjectId, ref: "User" }, checkedAt: { type: Date } },
        documentationVerified: { checkedBy: { type: Schema.Types.ObjectId, ref: "User" }, checkedAt: { type: Date } },
        sanctionsChecked: { checkedBy: { type: Schema.Types.ObjectId, ref: "User" }, checkedAt: { type: Date } },
        kycVerified: { checkedBy: { type: Schema.Types.ObjectId, ref: "User" }, checkedAt: { type: Date } },
      },
      _id: false,
    },
    wireExecution: {
      type: {
        executedAt: { type: Date },
        executedBy: { type: Schema.Types.ObjectId, ref: "User" },
        executedForeignAmount: { type: Number },
        executedNetAmount: { type: Number },
        swiftReference: { type: String, trim: true },
        uetr: { type: String, trim: true },
        adminNote: { type: String },
        providerStatus: { type: String },
      },
      _id: false,
    },
  },
  { timestamps: true }
);

/**
 * ⚙️ Índices estratégicos
 * - Busca rápida por usuário e status
 * - Ordenação por data de criação (últimos primeiro)
 */
CashoutRequestSchema.index({ userId: 1, status: 1 });
CashoutRequestSchema.index({ createdAt: -1 });

/**
 * ✅ Export default (compatível com import CashoutRequest from ...)
 */
const CashoutRequest = mongoose.model<ICashoutRequest>(
  "CashoutRequest",
  CashoutRequestSchema
);

export default CashoutRequest;
