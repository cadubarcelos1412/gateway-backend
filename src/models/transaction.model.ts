import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITransaction extends Document {
  // 👤 Identificadores internos
  sellerId: Types.ObjectId;
  userId?: Types.ObjectId;
  productId?: Types.ObjectId;

  // 🔗 Identificadores externos (Pagar.me)
  externalId?: string;
  orderId?: string;
  chargeId?: string;
  transactionId?: string;
  gatewayId?: string;

  // 💰 Valores financeiros
  amount: number;
  netAmount?: number;
  fee?: number;

  // 💳 Método e status de pagamento
  method: "pix" | "credit_card" | "boleto" | "debit_card";
  status: "pending" | "approved" | "failed" | "refunded" | "waiting_payment";
  
  // 📝 Informações gerais
  description?: string;
  flags?: string[];
  
  // 🔐 Metadados de segurança
  metadata?: { 
    ipAddress?: string; 
    deviceId?: string;
    userAgent?: string;
  };

  // 🎯 Dados específicos do PIX
  pixData?: {
    qrCode?: string;
    qrCodeUrl?: string;
    expiresAt?: Date;
    pixProviderTid?: string;
  };

  // 💳 Dados específicos de cartão
  cardData?: {
    lastFourDigits?: string;
    brand?: string;
    holderName?: string;
    installments?: number;
  };

  // 🧾 Dados da compra
  purchaseData?: {
    products?: {
      id?: string;
      name?: string;
      price?: number;
      quantity?: number;
    }[];
    customer?: {
      name?: string;
      email?: string;
      document?: string;
      documentType?: "CPF" | "CNPJ";
      phone?: string;
      ip?: string;
    };
  };

  // 📊 Parâmetros de rastreamento (UTM)
  trackingParameters?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
  };

  // 🔔 Webhooks recebidos
  webhookEvents?: {
    event: string;
    receivedAt: Date;
    data?: any;
  }[];

  // 📅 Timestamps
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
  canceledAt?: Date;
  refundedAt?: Date;

  // 🔄 Métodos
  addWebhookEvent(event: string, data?: any): Promise<this>;
  updateStatus(newStatus: "pending" | "approved" | "failed" | "refunded" | "waiting_payment"): Promise<this>;
  
  // 🎯 Virtuals
  isExpired: boolean;
  calculatedNetAmount: number;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    sellerId: { 
      type: Schema.Types.ObjectId, 
      ref: "Seller", 
      required: true, 
      index: true 
    },
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: "User" 
    },
    productId: { 
      type: Schema.Types.ObjectId, 
      ref: "Product" 
    },
    externalId: { 
      type: String, 
      index: true,
      sparse: true 
    },
    orderId: { 
      type: String, 
      index: true,
      sparse: true 
    },
    chargeId: { 
      type: String, 
      index: true,
      sparse: true 
    },
    transactionId: { 
      type: String, 
      index: true,
      sparse: true 
    },
    gatewayId: { 
      type: String 
    },
    amount: { 
      type: Number, 
      required: true,
      min: 0 
    },
    netAmount: { 
      type: Number,
      min: 0 
    },
    fee: { 
      type: Number,
      min: 0,
      default: 0 
    },
    method: { 
      type: String, 
      enum: ["pix", "credit_card", "boleto", "debit_card"], 
      required: true,
      index: true 
    },
    status: { 
      type: String, 
      enum: ["pending", "approved", "failed", "refunded", "waiting_payment"], 
      default: "pending",
      index: true 
    },
    description: { 
      type: String, 
      trim: true 
    },
    flags: [{ 
      type: String, 
      trim: true 
    }],
    metadata: {
      ipAddress: { type: String },
      deviceId: { type: String },
      userAgent: { type: String },
    },
    pixData: {
      qrCode: { type: String },
      qrCodeUrl: { type: String },
      expiresAt: { type: Date },
      pixProviderTid: { type: String },
    },
    cardData: {
      lastFourDigits: { type: String, maxlength: 4 },
      brand: { type: String, lowercase: true },
      holderName: { type: String, uppercase: true },
      installments: { type: Number, min: 1, default: 1 },
    },
    purchaseData: {
      products: [
        {
          id: String,
          name: String,
          price: { type: Number, min: 0 },
          quantity: { type: Number, min: 1 },
        },
      ],
      customer: {
        name: String,
        email: { type: String, lowercase: true },
        document: String,
        documentType: { type: String, enum: ["CPF", "CNPJ"] },
        phone: String,
        ip: String,
      },
    },
    trackingParameters: {
      utm_source: String,
      utm_medium: String,
      utm_campaign: String,
      utm_content: String,
      utm_term: String,
    },
    webhookEvents: [
      {
        event: { type: String, required: true },
        receivedAt: { type: Date, default: Date.now },
        data: Schema.Types.Mixed,
      },
    ],
    paidAt: { type: Date },
    canceledAt: { type: Date },
    refundedAt: { type: Date },
  },
  { 
    timestamps: true
  }
);

// 🔍 Índices compostos
TransactionSchema.index({ sellerId: 1, status: 1 });
TransactionSchema.index({ sellerId: 1, createdAt: -1 });
TransactionSchema.index({ externalId: 1, orderId: 1 });

// 🔍 Índice de texto
TransactionSchema.index({ 
  description: 'text', 
  'purchaseData.customer.name': 'text',
  'purchaseData.customer.email': 'text' 
});

// 🎯 Virtual para verificar se está expirado
TransactionSchema.virtual('isExpired').get(function(this: ITransaction) {
  if (this.pixData?.expiresAt) {
    return new Date() > this.pixData.expiresAt;
  }
  return false;
});

// 💰 Virtual para calcular valor líquido
TransactionSchema.virtual('calculatedNetAmount').get(function(this: ITransaction) {
  if (this.netAmount !== undefined) {
    return this.netAmount;
  }
  return this.amount - (this.fee || 0);
});

// 🔄 Método para adicionar evento de webhook
TransactionSchema.methods.addWebhookEvent = function(event: string, data?: any) {
  if (!this.webhookEvents) {
    this.webhookEvents = [];
  }
  this.webhookEvents.push({
    event,
    receivedAt: new Date(),
    data,
  });
  return this.save();
};

// 🎯 Método para atualizar status
TransactionSchema.methods.updateStatus = function(
  newStatus: "pending" | "approved" | "failed" | "refunded" | "waiting_payment"
) {
  this.status = newStatus;
  
  switch (newStatus) {
    case 'approved':
      this.paidAt = new Date();
      break;
    case 'failed':
      this.canceledAt = new Date();
      break;
    case 'refunded':
      this.refundedAt = new Date();
      break;
  }
  
  return this.save();
};

export const Transaction = mongoose.model<ITransaction>("Transaction", TransactionSchema);